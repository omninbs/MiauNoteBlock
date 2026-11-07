#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分析 NBS 音色 OGG 与 FluidR3 GM program 采样的音频特征并做相似度匹配。

目的:
    MIDI 导入的音色拟合预设 (nbs_client.js 的 GM_TIMBRE_MAP) 长期依赖人工
    听感判断。本脚本把 static/sounds/*.ogg (NBS 20 种乐器) 与
    FluidR3_GM.sf2 中 128 个 GM program 的代表采样放到同一特征空间:

      - 延音标记 (sustained)
      - 衰减时长 decay_ms (峰值 -> 10%, 封顶 8000ms)
      - 频谱质心 centroid_hz (亮度)
      - 频谱平坦度 flatness (噪声感/谐波感)
      - 起音时长 attack_ms (10% -> 90% 峰值)

    再做加权 L1 距离匹配, 输出:
      1) 每个 NBS 乐器最接近的 GM program 排名;
      2) 每个 GM program 最接近的 NBS 乐器排名, 并对照 GM_TIMBRE_MAP
         当前主音色给出 "排名 >= 3 的待复查项"。

用法:
    python tools/analyze_nbs.py

依赖: Python 标准库 + numpy + soundfile (解码 OGG)。
输出: 控制台摘要 + tools/nbs_timbre_report.json
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent
sys.path.insert(0, str(TOOLS_DIR))

from analyze_sf2 import Sf2File, _first, GEN_SAMPLE_ID  # noqa: E402

SOUNDS_DIR = PROJECT_ROOT / "src" / "static" / "sounds"
SF2_PATH = PROJECT_ROOT / ".trae" / "FluidR3_GM.sf2"
OUT_PATH = TOOLS_DIR / "nbs_timbre_report.json"

# NBS 乐器编号 -> OGG 文件名 (与 nbs_client.js INSTRUMENT_NAMES 对应)
NBS_INSTRUMENTS = [
    (0, "harp", "Harp"),
    (1, "dbass", "Double Bass"),
    (2, "bdrum", "Bass Drum"),
    (3, "sdrum", "Snare Drum"),
    (4, "click", "Click"),
    (5, "guitar", "Guitar"),
    (6, "flute", "Flute"),
    (7, "bell", "Bell"),
    (8, "icechime", "Chime"),
    (9, "xylobone", "XYlophone"),
    (10, "iron_xylophone", "Iron Xylophone"),
    (11, "cow_bell", "Cow Bell"),
    (12, "didgeridoo", "Didgeridoo"),
    (13, "bit", "Bit(Chip)"),
    (14, "banjo", "Banjo"),
    (15, "pling", "Pling"),
    (16, "copper", "Copper Horn"),
    (17, "copper_exposed", "Copper Horn (Exposed)"),
    (18, "copper_weathered", "Copper Horn (Weathered)"),
    (19, "copper_oxidized", "Copper Horn (Oxidized)"),
]
# 参与 GM 匹配的旋律类乐器 (鼓/打击噪声不参与)
MELODIC_IDS = {0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19}

# ---- 特征提取参数 (与 analyze_sf2.py 口径一致) ----
BUCKET_MS = 20
DECAY_CAP_MS = 8000
DECAY_FLOOR_MS = 40
CENTROID_FLOOR_HZ = 100
CENTROID_CAP_HZ = 8000
ATTACK_FLOOR_MS = 2
ATTACK_CAP_MS = 2000

# ---- 距离权重 ----
W_SUSTAIN = 1.5
W_DECAY = 1.0
W_CENTROID = 1.2
W_FLATNESS = 0.6
W_ATTACK = 0.4


# ---------- 通用特征 ----------

def rms_envelope(pcm: np.ndarray, sr: int) -> tuple[np.ndarray, float]:
    bucket = max(1, int(round(sr * BUCKET_MS / 1000.0)))
    if pcm.size < bucket:
        pcm = np.pad(pcm, (0, bucket - pcm.size))
    n = max(1, pcm.size // bucket)
    blocks = pcm[: n * bucket].reshape(n, bucket).astype(np.float64)
    return np.sqrt(np.mean(blocks ** 2, axis=1)), float(bucket * 1000.0 / sr)


def envelope_features(pcm: np.ndarray, sr: int) -> dict:
    rms, ms_per_bucket = rms_envelope(pcm, sr)
    peak = float(rms.max()) if rms.size else 0.0
    if not np.isfinite(peak) or peak < 1e-5:
        return {"sustained": False, "decay_ms": 0, "attack_ms": 0, "tail_ratio": 0.0}

    norm = rms / peak
    peak_idx = int(np.argmax(rms))
    peak_time_ms = peak_idx * ms_per_bucket
    duration_ms = pcm.size * 1000.0 / sr

    # 起音: 10% -> 90% 峰值
    rise = np.nonzero(norm[: peak_idx + 1] >= 0.9)[0]
    hit10 = np.nonzero(norm[: peak_idx + 1] >= 0.1)[0]
    attack_ms = int((rise[0] - hit10[0]) * ms_per_bucket) if rise.size and hit10.size else 0
    attack_ms = max(attack_ms, ATTACK_FLOOR_MS)

    # 衰减: 峰值后降到 10% 的时间
    after = norm[peak_idx:]
    below = np.nonzero(after <= 0.1)[0]
    if below.size:
        decay_ms = int(below[0] * ms_per_bucket)
    else:
        decay_ms = int(min(DECAY_CAP_MS, duration_ms - peak_time_ms))

    # 尾部能量比 (最后 150ms 的 RMS / 峰值)
    tail_n = max(1, int(round(150.0 / ms_per_bucket)))
    tail = float(np.sqrt(np.mean(rms[-tail_n:] ** 2))) if rms.size else 0.0

    # 单发采样延音判定: 尾部仍有足够能量视为持续型 ( flute/铜号类 )
    sustained = bool(tail >= 0.5 or decay_ms >= 3000)

    return {
        "sustained": sustained,
        "decay_ms": max(decay_ms, DECAY_FLOOR_MS),
        "attack_ms": min(attack_ms, ATTACK_CAP_MS),
        "tail_ratio": round(tail, 4),
    }


def spectral_features(pcm: np.ndarray, sr: int) -> dict:
    """加帧 STFT, 取有声帧 (RMS > 10% 峰值) 的质心/扩展度/滚降点。

    注意: 不使用频谱平坦度 — 功率谱存在大量近零 bin 时对数几何均值趋零,
    该特征在本数据上无区分度。
    """
    frame = 2048
    hop = 1024
    if pcm.size < frame:
        pcm = np.pad(pcm, (0, frame - pcm.size))
    win = np.hanning(frame)
    frames = np.lib.stride_tricks.sliding_window_view(pcm, frame)[::hop]
    if frames.shape[0] > 400:
        frames = frames[:: frames.shape[0] // 400 + 1]
    spec = np.abs(np.fft.rfft(frames * win, axis=1)) ** 2
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    voiced = frame_rms > 0.1 * float(frame_rms.max())
    if not voiced.any():
        voiced = np.ones(spec.shape[0], dtype=bool)
    spec = spec[voiced]
    freqs = np.fft.rfftfreq(frame, 1.0 / sr)

    w = spec.sum(axis=0)
    centroid = float((freqs * w).sum() / max(w.sum(), 1e-12))
    # 扩展度: 能量围绕质心的标准差 (Hz) — 谐波集中 vs 频谱弥散
    spread = float(np.sqrt((w * (freqs - centroid) ** 2).sum() / max(w.sum(), 1e-12)))
    # 85% 滚降频率 (能量加权)
    cum = np.cumsum(spec, axis=1)
    total = cum[:, -1:]
    rolloff_idx = np.argmax(cum >= 0.85 * total, axis=1)
    rolloff = float(np.mean(freqs[rolloff_idx]))

    return {
        "centroid_hz": round(centroid, 1),
        "spread_hz": round(spread, 1),
        "rolloff_hz": round(rolloff, 1),
    }


def analyze_pcm_full(pcm: np.ndarray, sr: int) -> dict | None:
    if pcm is None or pcm.size < 64:
        return None
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    peak = float(np.max(np.abs(pcm)))
    if peak < 1e-5:
        return None
    pcm = pcm / peak
    env = envelope_features(pcm, sr)
    spec = spectral_features(pcm, sr)
    return {**env, **spec}


# ---------- 主流程 ----------

def main():
    if not SOUNDS_DIR.is_dir():
        raise SystemExit("找不到音色目录: %s" % SOUNDS_DIR)
    if not SF2_PATH.is_file():
        raise SystemExit("找不到 SF2 文件: %s" % SF2_PATH)

    # 1) NBS OGG 侧
    nbs = {}
    for iid, fname, label in NBS_INSTRUMENTS:
        path = SOUNDS_DIR / (fname + ".ogg")
        if not path.is_file():
            print("警告: 缺少 %s" % path.name)
            continue
        pcm, sr = sf.read(str(path), always_2d=False)
        feats = analyze_pcm_full(np.asarray(pcm, dtype=np.float64), sr)
        if feats is None:
            print("警告: %s 解析失败" % path.name)
            continue
        feats["id"] = iid
        feats["label"] = label
        nbs[iid] = feats

    # 2) SF2 GM program 侧 (复用 analyze_sf2 的代表 zone 逻辑)
    sf2 = Sf2File(SF2_PATH)
    gm = {}
    try:
        for prog in range(128):
            inst_index = sf2.preset_instrument(prog)
            gens = sf2.instrument_zone(inst_index) if inst_index is not None else None
            sample_id = _first(gens, GEN_SAMPLE_ID, -1) if gens else -1
            if gens is None or not (0 <= sample_id < len(sf2.shdr) - 1):
                continue
            pcm, sr, _looped, _loop_rel = sf2.read_sample(sample_id, gens)
            feats = analyze_pcm_full(pcm.astype(np.float64), sr)
            if feats is None:
                continue
            feats["program"] = prog
            gm[prog] = feats
    finally:
        sf2.close()

    # 3) 距离矩阵 (仅旋律类 NBS 乐器参与)
    # 特征取 log10 (频率/时长量纲差异大), 对全体样本做 z-score 标准化,
    # 避免某一维 span 过小而主导距离
    melodic = [nbs[i] for i in sorted(nbs) if i in MELODIC_IDS]
    all_samples = melodic + list(gm.values())

    def feat_vector(f: dict) -> np.ndarray:
        return np.array([
            math.log10(max(f["centroid_hz"], CENTROID_FLOOR_HZ)),
            math.log10(max(f["spread_hz"], 10.0)),
            math.log10(max(f["rolloff_hz"], CENTROID_FLOOR_HZ)),
            math.log10(max(f["decay_ms"], DECAY_FLOOR_MS)),
            math.log10(max(f["attack_ms"], ATTACK_FLOOR_MS)),
        ])

    matrix = np.array([feat_vector(f) for f in all_samples])
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0)
    std[std < 1e-6] = 1.0

    # 权重: 音色亮度(质心/扩展/滚降)为主, 包络(衰减/起音)为辅
    weights = np.array([W_CENTROID, 0.6, 0.8, W_DECAY, 0.3])

    def distance(a: dict, b: dict) -> float:
        va = (feat_vector(a) - mean) / std
        vb = (feat_vector(b) - mean) / std
        return round(float(np.abs(va - vb) @ weights), 4)

    # 当前 GM_TIMBRE_MAP 主音色 (从 nbs_client.js 提取, 人工同步)
    current_main = load_current_main()

    programs_report = {}
    mismatches = []
    for prog in sorted(gm):
        ranked = sorted(melodic, key=lambda f: distance(f, gm[prog]))
        top = [(f["id"], f["label"], distance(f, gm[prog])) for f in ranked[:3]]
        main_now = current_main.get(prog)
        rank_now = next((r + 1 for r, f in enumerate(ranked) if f["id"] == main_now), None)
        programs_report[str(prog)] = {"top3": top, "current_main": main_now, "current_rank": rank_now}
        if rank_now is not None and rank_now >= 3:
            mismatches.append((prog, rank_now, top))

    nbs_report = {}
    for f in melodic:
        progs = sorted(gm.values(), key=lambda g: distance(f, g))
        nbs_report[str(f["id"])] = {
            "label": f["label"],
            "nearest_programs": [(g["program"], distance(g, f)) for g in progs[:6]],
        }

    # 4) 摘要
    print("=" * 74)
    print("NBS 音色特征 (melodic):")
    for f in melodic:
        print(
            "  [%2d] %-26s sustained=%-5s decay=%5dms centroid=%6.0fHz spread=%6.0fHz attack=%4dms"
            % (
                f["id"], f["label"], f["sustained"], f["decay_ms"],
                f["centroid_hz"], f["spread_hz"], f["attack_ms"],
            )
        )
    print("-" * 74)
    print("GM program 与当前主音色排名不符 (rank >= 3, 建议复查):")
    if mismatches:
        for prog, rank, top in mismatches:
            print(
                "  [%3d] rank=%d  top3=%s"
                % (prog, rank, ", ".join("%s(%s,%.2f)" % (t[1], t[0], t[2]) for t in top))
            )
    else:
        print("  无 — 全部主音色均排在数据匹配前 2 名")
    print("=" * 74)

    payload = {
        "meta": {"generated_by": "tools/analyze_nbs.py", "version": 1},
        "nbs_features": {str(k): v for k, v in nbs.items()},
        "gm_features": {str(k): v for k, v in gm.items()},
        "nbs_nearest_programs": nbs_report,
        "programs_nearest_nbs": programs_report,
        "mismatch_programs": [m[0] for m in mismatches],
    }
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("已写出: %s (%.1f KB)" % (OUT_PATH, OUT_PATH.stat().st_size / 1024.0))


def load_current_main() -> dict[int, int]:
    """从 nbs_client.js 源码解析 GM_TIMBRE_MAP 的 [name, main, ...] 列。"""
    src = (PROJECT_ROOT / "src" / "static" / "js" / "nbs_client.js").read_text(encoding="utf-8")
    start = src.index("var GM_TIMBRE_MAP = [")
    end = src.index("];", start)
    body = src[start:end]
    result: dict[int, int] = {}
    prog = 0
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("[") or prog > 127:
            continue
        try:
            parts = [p.strip() for p in line[1: line.index("]")].split(",")]
            result[prog] = int(parts[1])
        except (ValueError, IndexError):
            pass
        prog += 1
    return result


if __name__ == "__main__":
    main()
