
# The simple, current philosophy

1. a measuring instrument can return data of any shape
2. the measurment configuration can return multiple values (metrics) for that _one_ given shape
3. The output of the metric is _always_ a number or a boolean.*



*Future state is that maybe we would add _categorical_ types. 

```
tsErrors  (instrument: shell · hash 3f9a…)

                         model A     model A       model B     model B
                                     strict md                 strict md
──────────────────────────────────────────────────────────────────────────
errorCount  mean ↓       2.1         0.9 ✓         4.6         3.8
            median       1           0             4           3
            p90          6           3             11          9
errorsByCode  mean/run
  TS2322 type mismatch   1.20        0.25          0.30        0.22
  TS2339 no property     0.55        0.48          0.20        0.31
  TS7006 implicit any    0.10        0.02          2.40        2.10
  TS2307 module missing  0.00        0.00          1.05        0.90
  other (6 codes)        0.25        0.15          0.65        0.27
coverage                 98/100      100/100       97/100      99/100

```