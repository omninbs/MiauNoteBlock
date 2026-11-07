#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分析 FluidR3_GM.sf2，生成 GM 音色特征数据（用于 MIDI 导入的伪延音淡出）。

用法:
    python tools/analyze_sf2.py

脚本只依赖 Python 标准库与 numpy：内置最小 RIFF / SF2 解析器，
读取 pdta 中的 phdr/pbag/pgen/inst/ibag/igen/shdr 与 sdta 中的 smpl
（16bit PCM），对 128 个 GM program 各取 1 个代表 zone，计算 RMS 包络、
衰减时长、曲线类型与是否自带延音（loop）。

输出:
    src/static/data/gm_sf2_profile.json
"""

from __future__ import annotations

import json
import struct
from datetime import date
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SF2_PATH = PROJECT_ROOT / ".trae" / "FluidR3_GM.sf2"
OUT_PATH = PROJECT_ROOT / "src" / "static" / "data" / "gm_sf2_profile.json"

# ---- SoundFont 2 generator 编号（仅列出本脚本用到的）----
GEN_START_ADD_OFFSET = 0       # 采样起点偏移（样本）
GEN_END_ADD_OFFSET = 1         # 采样终点偏移（样本）
GEN_START_LOOP_OFFSET = 2      # 循环起点偏移（样本）
GEN_END_LOOP_OFFSET = 3        # 循环终点偏移（样本）
GEN_START_ADD_COARSE = 4       # 起点偏移（32768 样本为单位）
GEN_END_ADD_COARSE = 12        # 终点偏移（32768 样本为单位）
GEN_START_LOOP_COARSE = 45     # 循环起点偏移（32768 样本为单位）
GEN_END_LOOP_COARSE = 50       # 循环终点偏移（32768 样本为单位）
GEN_INSTRUMENT = 41            # preset zone 指向的 instrument 索引
GEN_KEY_RANGE = 43             # 键位范围（低字节=lo, 高字节=hi）
GEN_SAMPLE_ID = 53             # instrument zone 指向的 sample 索引
GEN_SAMPLE_MODES = 54          # bit0=循环播放

# ---- 包络分析参数 ----
BUCKET_MS = 20                 # RMS 包络的时间分桶（毫秒）
MAX_ANALYSIS_MS = 8000         # 单次分析最长时间
DECAY_CAP_MS = 8000            # decay_ms 上限
ENV_POINTS = 12                # 输出包络采样点数量（8~16）
ENV_WINDOW_MS = 4000           # 包络覆盖时长（从峰值算起）
REPRESENTATIVE_KEY = 60        # 取覆盖中央 C 的代表 zone
LOOP_SUSTAIN_RMS = 0.25        # 循环点仍需保留的振幅比例（否则视为低能量尾段）

# 采样缺失/异常时的兜底数值（要求：不中断脚本）
FALLBACK_DECAY_MS = 1200
FALLBACK_ENV = [round(1.0 - i / 7.0, 4) for i in range(8)]  # 线性下降 8 点


def _signed16(value: int) -> int:
    """把 16 位无符号 generator 值按有符号解释（偏移类 generator 需要）。"""
    return value - 65536 if value >= 32768 else value


def _read_chunk_header(f, pos: int):
    """读取 pos 处的 RIFF 块头，返回 (id, size)；越界返回 None。"""
    f.seek(pos)
    head = f.read(8)
    if len(head) < 8:
        return None
    return head[:4].decode("ascii", "replace"), struct.unpack("<I", head[4:8])[0]


class Sf2File:
    """最小 SF2 解析器：定位 pdta 各子块与 smpl 数据区。"""

    def __init__(self, path: Path):
        self.path = path
        self.f = open(path, "rb", buffering=1024 * 1024)
        riff_id, riff_size = _read_chunk_header(self.f, 0)
        if riff_id != "RIFF":
            raise ValueError("不是 RIFF 文件")
        self.f.seek(8)
        if self.f.read(4).decode("ascii", "replace") != "sfbk":
            raise ValueError("不是 SF2 文件（RIFF form 不是 sfbk）")

        self.pdta = {}          # chunk id -> (data_offset, size)
        self.smpl_offset = 0
        self.smpl_size = 0
        self._scan_chunks(12, 8 + riff_size, is_pdta=False)

        if self.smpl_size == 0:
            raise ValueError("SF2 中未找到 smpl 采样数据块")
        self.smpl_count = self.smpl_size // 2

        self.phdr = self._parse_phdr(self._chunk_bytes("phdr"))
        self.pbag = self._parse_bag(self._chunk_bytes("pbag"))
        self.pgen = self._parse_gen(self._chunk_bytes("pgen"))
        self.inst = self._parse_inst(self._chunk_bytes("inst"))
        self.ibag = self._parse_bag(self._chunk_bytes("ibag"))
        self.igen = self._parse_gen(self._chunk_bytes("igen"))
        self.shdr = self._parse_shdr(self._chunk_bytes("shdr"))

    def close(self):
        self.f.close()

    # ---------- RIFF 结构 ----------

    def _scan_chunks(self, start: int, end: int, is_pdta: bool):
        pos = start
        while pos + 8 <= end:
            header = _read_chunk_header(self.f, pos)
            if header is None:
                break
            cid, size = header
            data_pos = pos + 8
            if cid == "LIST":
                self.f.seek(data_pos)
                list_type = self.f.read(4).decode("ascii", "replace")
                if list_type == "pdta":
                    self._scan_chunks(data_pos + 4, data_pos + size, is_pdta=True)
                elif list_type == "sdta":
                    self._scan_chunks(data_pos + 4, data_pos + size, is_pdta=False)
            elif is_pdta:
                self.pdta[cid] = (data_pos, size)
            elif cid == "smpl":
                self.smpl_offset = data_pos
                self.smpl_size = size
            pos = data_pos + size + (size & 1)

    def _chunk_bytes(self, cid: str) -> bytes:
        if cid not in self.pdta:
            raise ValueError("缺少 pdta 子块: %s" % cid)
        offset, size = self.pdta[cid]
        self.f.seek(offset)
        return self.f.read(size)

    # ---------- pdta 子块解析 ----------

    @staticmethod
    def _name(raw: bytes) -> str:
        return raw.split(b"\x00", 1)[0].decode("latin-1").strip()

    def _parse_phdr(self, data: bytes) -> list[dict]:
        count = len(data) // 38
        out = []
        for i in range(count):
            base = i * 38
            preset, bank, bag_ndx = struct.unpack_from("<HHH", data, base + 20)
            out.append({
                "name": self._name(data[base:base + 20]),
                "preset": preset,
                "bank": bank,
                "bag_ndx": bag_ndx,
            })
        return out

    def _parse_bag(self, data: bytes) -> list[dict]:
        count = len(data) // 4
        return [
            {"gen_ndx": struct.unpack_from("<H", data, i * 4)[0]}
            for i in range(count)
        ]

    def _parse_gen(self, data: bytes) -> list[dict]:
        count = len(data) // 4
        return [
            {
                "gen": struct.unpack_from("<H", data, i * 4)[0],
                "amount": struct.unpack_from("<H", data, i * 4 + 2)[0],
            }
            for i in range(count)
        ]

    def _parse_inst(self, data: bytes) -> list[dict]:
        count = len(data) // 22
        return [
            {
                "name": self._name(data[i * 22:i * 22 + 20]),
                "bag_ndx": struct.unpack_from("<H", data, i * 22 + 20)[0],
            }
            for i in range(count)
        ]

    def _parse_shdr(self, data: bytes) -> list[dict]:
        count = len(data) // 46
        out = []
        for i in range(count):
            base = i * 46
            start, end, loop_start, loop_end, sample_rate = struct.unpack_from(
                "<5I", data, base + 20
            )
            original_pitch = data[base + 40]
            sample_type = struct.unpack_from("<H", data, base + 44)[0]
            out.append({
                "name": self._name(data[base:base + 20]),
                "start": start,
                "end": end,
                "loop_start": loop_start,
                "loop_end": loop_end,
                "sample_rate": sample_rate,
                "original_pitch": original_pitch,
                "sample_type": sample_type,
            })
        return out

    # ---------- zone 遍历 ----------

    def _zone_gens(self, bag: list[dict], gen: list[dict], index: int) -> dict[int, list[int]]:
        """返回第 index 个 bag 的 generator 映射：gen 编号 -> amount 列表。"""
        start = bag[index]["gen_ndx"]
        end = bag[index + 1]["gen_ndx"] if index + 1 < len(bag) else len(gen)
        result: dict[int, list[int]] = {}
        for item in gen[start:end]:
            result.setdefault(item["gen"], []).append(item["amount"])
        return result

    def preset_instrument(self, preset_index: int) -> int | None:
        """取 preset 第一个带 instrument generator 的 zone（默认乐器）。"""
        start = self.phdr[preset_index]["bag_ndx"]
        end = self.phdr[preset_index + 1]["bag_ndx"]
        for i in range(start, end):
            gens = self._zone_gens(self.pbag, self.pgen, i)
            if GEN_INSTRUMENT in gens:
                return gens[GEN_INSTRUMENT][0]
        return None

    def instrument_zone(self, inst_index: int) -> dict[int, list[int]] | None:
        """取代表 zone：优先覆盖中央 C，且取采样最长的一层。

        FluidR3 的各 instrument 常按音域拆成多个 zone，并在多个 zone 上
        叠加不同层。这里只分析 1 个代表 zone：覆盖中央 C（60）的候选里
        选采样时长最长者，能避免选中只有几毫秒的单周期振荡器采样。
        """
        if not (0 <= inst_index < len(self.inst) - 1):
            return None
        start = self.inst[inst_index]["bag_ndx"]
        end = self.inst[inst_index + 1]["bag_ndx"]
        candidates = [
            self._zone_gens(self.ibag, self.igen, i)
            for i in range(start, end)
        ]
        candidates = [g for g in candidates if GEN_SAMPLE_ID in g]
        if not candidates:
            return None

        def covers_key(gens: dict[int, list[int]]) -> bool:
            values = gens.get(GEN_KEY_RANGE)
            if not values:
                return True  # 未写 keyRange 的 zone 对所有键位生效
            amount = values[0]
            lo, hi = amount & 0xFF, (amount >> 8) & 0xFF
            return lo <= REPRESENTATIVE_KEY <= hi

        def sample_duration(gens: dict[int, list[int]]) -> float:
            sid = gens[GEN_SAMPLE_ID][0]
            if not (0 <= sid < len(self.shdr) - 1):
                return -1.0
            shdr = self.shdr[sid]
            return (shdr["end"] - shdr["start"]) / max(1, shdr["sample_rate"])

        pool = [g for g in candidates if covers_key(g)] or candidates
        return max(pool, key=sample_duration)

    # ---------- PCM 读取 ----------

    def read_sample(self, shdr_index: int, gens: dict[int, list[int]]):
        """按 shdr + 采样偏移 generator 读取 PCM（float32，范围 -1..1）。"""
        shdr = self.shdr[shdr_index]
        sr = shdr["sample_rate"]
        if sr <= 0:
            return None, 0, has_loop(gens), None

        start_off = _signed16(_first(gens, GEN_START_ADD_OFFSET, 0))
        start_off += _signed16(_first(gens, GEN_START_ADD_COARSE, 0)) * 32768
        end_off = _signed16(_first(gens, GEN_END_ADD_OFFSET, 0))
        end_off += _signed16(_first(gens, GEN_END_ADD_COARSE, 0)) * 32768

        start = max(0, min(shdr["start"] + start_off, self.smpl_count - 1))
        end = max(start + 1, min(shdr["end"] + end_off, self.smpl_count))
        # 只读分析所需的最长片段，避免整段长采样拖慢速度
        max_samples = int(round(sr * (MAX_ANALYSIS_MS + 200) / 1000.0))
        end = min(end, start + max_samples)

        self.f.seek(self.smpl_offset + start * 2)
        raw = self.f.read((end - start) * 2)
        pcm = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0

        # 循环区间（相对已读取 PCM 的起止下标），用于判断循环段是否仍有能量
        loop_rel = None
        if has_loop(gens):
            loop_start = shdr["loop_start"]
            loop_start += _signed16(_first(gens, GEN_START_LOOP_OFFSET, 0))
            loop_start += _signed16(_first(gens, GEN_START_LOOP_COARSE, 0)) * 32768
            loop_end = shdr["loop_end"]
            loop_end += _signed16(_first(gens, GEN_END_LOOP_OFFSET, 0))
            loop_end += _signed16(_first(gens, GEN_END_LOOP_COARSE, 0)) * 32768
            ls = max(0, loop_start - start)
            le = min(pcm.size, loop_end - start)
            if le > ls:
                loop_rel = (ls, le)

        return pcm, sr, has_loop(gens), loop_rel


def _first(gens: dict[int, list[int]], gen_id: int, default: int) -> int:
    values = gens.get(gen_id)
    return values[0] if values else default


def has_loop(gens: dict[int, list[int]]) -> bool:
    """是否循环采样：sampleModes bit0（1=连续循环，3=循环后再播尾部）。"""
    modes = _first(gens, GEN_SAMPLE_MODES, 0)
    return bool(modes & 1)


def clean_name(raw: str) -> str:
    """清理预设显示名：去掉 % 前缀、多余空白等。"""
    name = raw.replace("\x00", "").strip()
    name = name.lstrip("%").strip()
    name = " ".join(name.split())
    return name


# ---------- 包络分析 ----------

def _value_at(norm: np.ndarray, ms: float) -> float:
    t = ms / BUCKET_MS
    return float(np.interp(t, np.arange(norm.size), norm))


def _classify_curve(norm: np.ndarray, peak_idx: int) -> str:
    """用线性 / 指数拟合比较，判断非延音音色的衰减曲线。"""
    segment = norm[peak_idx:peak_idx + int(2000 / BUCKET_MS) + 1]
    if segment.size < 5:
        return "exponential"
    t = np.arange(segment.size) * (BUCKET_MS / 1000.0)
    mask = segment > 0.02
    if mask.sum() < 5:
        return "exponential"
    t = t[mask]
    y = segment[mask]
    design = np.vstack([t, np.ones_like(t)]).T

    # 线性拟合 y = a*t + b
    coef_lin, *_ = np.linalg.lstsq(design, y, rcond=None)
    lin_rmse = float(np.sqrt(np.mean((y - design @ coef_lin) ** 2)))

    # 指数拟合 y = exp(c*t + d)，在 log 域做最小二乘
    coef_exp, *_ = np.linalg.lstsq(design, np.log(np.maximum(y, 1e-6)), rcond=None)
    exp_rmse = float(np.sqrt(np.mean((y - np.exp(design @ coef_exp)) ** 2)))

    # 线性拟合明显更好才判为 linear，否则按常见的指数衰减处理
    return "linear" if lin_rmse < exp_rmse * 0.8 else "exponential"


def analyze_pcm(pcm: np.ndarray, sr: int, looped: bool,
                loop_rel: tuple[int, int] | None = None) -> dict | None:
    """计算归一化 RMS 包络及衰减特征；样本过短/静音返回 None。"""
    bucket = max(1, int(round(sr * BUCKET_MS / 1000.0)))
    n = pcm.size // bucket
    if n < 4:
        # FluidR3 的部分合成音色使用几毫秒的单周期振荡器采样并无限循环，
        # 无法用 20ms 分桶做衰减分析，直接按持续音（恒定包络）处理。
        if looped and pcm.size >= 2:
            peak = float(np.sqrt(np.mean(pcm.astype(np.float64) ** 2)))
            if peak < 1e-5:
                return None
            return {
                "decay_ms": DECAY_CAP_MS,
                "curve": "sustained",
                "is_sustained": True,
                "env": [1.0] * ENV_POINTS,
                "peak_rms": round(peak, 4),
                "tail_rms": 1.0,
            }
        return None

    blocks = pcm[:n * bucket].reshape(n, bucket).astype(np.float64)
    rms = np.sqrt(np.mean(blocks ** 2, axis=1))
    peak = float(rms.max())
    if not np.isfinite(peak) or peak < 1e-5:
        return None
    norm = rms / peak
    peak_idx = int(np.argmax(rms))
    duration_ms = pcm.size * 1000.0 / sr

    peak_time_ms = peak_idx * BUCKET_MS

    # 峰值后首次降到 10% 的时间；未降到则按峰值之后的剩余时长（封顶 8000ms）
    after = norm[peak_idx:]
    below = np.nonzero(after <= 0.1)[0]
    if below.size:
        decay_ms = int(below[0] * BUCKET_MS)
    else:
        decay_ms = int(min(MAX_ANALYSIS_MS, duration_ms - peak_time_ms))
    decay_ms = min(decay_ms, DECAY_CAP_MS)

    # 延音判定: 峰值 2s 后能量仍 >= 80%（从峰值起算, 与 decay 口径一致）
    v20 = _value_at(norm, peak_time_ms + 2000)
    # 循环段相对峰值的 RMS：FluidR3 的钢琴虽有 loop，但循环点位于衰减尾部，
    # 实际听感已接近结束；只保留能量可观的循环采样才算持续音
    loop_frac = 0.0
    if looped and loop_rel is not None:
        ls, le = loop_rel
        loop_rms = float(np.sqrt(np.mean(pcm[ls:le].astype(np.float64) ** 2)))
        loop_frac = loop_rms / peak
    is_sustained = v20 >= 0.8 or (looped and loop_frac >= LOOP_SUSTAIN_RMS)
    curve = "sustained" if is_sustained else _classify_curve(norm, peak_idx)

    # 包络：从峰值开始、覆盖最多 4s，等距取 12 点，首点归一化为 1
    window_ms = min(ENV_WINDOW_MS, max(0.0, duration_ms - peak_time_ms))
    window_ms = max(window_ms, BUCKET_MS)
    ts = np.linspace(0.0, window_ms, ENV_POINTS)
    env = [_value_at(norm, peak_time_ms + x) for x in ts]
    env[0] = 1.0

    return {
        "decay_ms": decay_ms,
        "curve": curve,
        "is_sustained": bool(is_sustained),
        "env": [round(float(v), 4) for v in env],
        "peak_rms": round(peak, 4),
        "tail_rms": round(float(env[-1]), 4),
    }


# ---------- 主流程 ----------

def fallback_profile(name: str) -> dict:
    return {
        "name": name,
        "is_sustained": False,
        "decay_ms": FALLBACK_DECAY_MS,
        "curve": "exponential",
        "env": list(FALLBACK_ENV),
        "peak_rms": 0.0,
        "tail_rms": 0.0,
        "fallback": True,
    }


def build_profiles(sf2: Sf2File):
    """构造 128 个 GM program 的特征数据。"""
    presets = {}
    for idx in range(len(sf2.phdr) - 1):
        preset = sf2.phdr[idx]
        if preset["preset"] > 127:
            continue
        # 同一个 preset 号优先取 bank 0（GM 旋律音色）
        if preset["preset"] not in presets or preset["bank"] == 0:
            presets[preset["preset"]] = (idx, preset)

    programs = {}
    fallbacks = []
    for prog in range(128):
        entry = presets.get(prog)
        if entry is None:
            programs[str(prog)] = fallback_profile("Program %d" % prog)
            fallbacks.append(prog)
            continue

        preset_idx, preset = entry
        display_name = clean_name(preset["name"]) or ("Program %d" % prog)
        inst_index = sf2.preset_instrument(preset_idx)
        gens = sf2.instrument_zone(inst_index) if inst_index is not None else None
        sample_id = _first(gens, GEN_SAMPLE_ID, -1) if gens else -1

        if gens is None or not (0 <= sample_id < len(sf2.shdr) - 1):
            programs[str(prog)] = fallback_profile(display_name)
            fallbacks.append(prog)
            continue

        pcm, sr, looped, loop_rel = sf2.read_sample(sample_id, gens)
        profile = analyze_pcm(pcm, sr, looped, loop_rel) if pcm is not None and pcm.size else None
        if profile is None:
            programs[str(prog)] = fallback_profile(display_name)
            fallbacks.append(prog)
            continue

        profile["name"] = display_name
        programs[str(prog)] = profile

    return programs, fallbacks


def print_summary(programs: dict, fallbacks: list[int]):
    decays = [p["decay_ms"] for p in programs.values() if not p.get("fallback")]
    sustained = sum(1 for p in programs.values() if p["is_sustained"])

    print("=" * 62)
    print("SF2 分析完成：%d 个 GM program" % len(programs))
    print("自带延音（sustained）数量: %d" % sustained)
    if decays:
        decays_sorted = sorted(decays)
        median = decays_sorted[len(decays_sorted) // 2]
        print(
            "decay_ms 分布: min=%d, median=%d, max=%d"
            % (min(decays), median, max(decays))
        )
    else:
        print("decay_ms 分布: 无有效数据")

    print("-" * 62)
    for prog in (0, 1, 16, 48):
        p = programs[str(prog)]
        print(
            "[%3d] %-28s sustained=%-5s decay=%4dms curve=%-11s peak=%.3f tail=%.3f"
            % (
                prog,
                p["name"][:28],
                p["is_sustained"],
                p["decay_ms"],
                p["curve"],
                p["peak_rms"],
                p["tail_rms"],
            )
        )
    if fallbacks:
        print("使用兜底数据的 program: %s" % ",".join(str(x) for x in fallbacks))
    else:
        print("所有 program 均成功解析，无兜底数据")
    print("=" * 62)


def main():
    if not SF2_PATH.is_file():
        raise SystemExit("找不到 SF2 文件: %s" % SF2_PATH)

    print("解析 %s ..." % SF2_PATH.name)
    sf2 = Sf2File(SF2_PATH)
    try:
        programs, fallbacks = build_profiles(sf2)
    finally:
        sf2.close()

    payload = {
        "meta": {
            "source": SF2_PATH.name,
            "generated": date.today().isoformat(),
            "version": 1,
        },
        "programs": {str(k): programs[str(k)] for k in range(128)},
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print_summary(payload["programs"], fallbacks)
    print("已写出: %s (%.1f KB)" % (OUT_PATH, OUT_PATH.stat().st_size / 1024.0))


if __name__ == "__main__":
    main()
