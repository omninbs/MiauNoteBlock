# tools

## analyze_sf2.py

解析 `.trae/FluidR3_GM.sf2`，生成 `src/static/data/gm_sf2_profile.json`（GM 0..127 的衰减特征）。

```bash
python tools/analyze_sf2.py
```

只需要 Python 3 与 numpy。
