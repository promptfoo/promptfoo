# Financial calculation fixtures

These synthetic cases pair verified references with correct rounded outputs and incorrect outputs. The references are used only for grading, not in the target prompts.

The FX reference is `1250 * 1.08375 * (1 - 0.004) = 1349.26875` USD.

The European option references use Black-Scholes with spot 120, strike 110, continuously compounded risk-free rate 0.03, volatility 0.25, time 0.75 years, and no dividends. Reproduce them independently of the TypeScript grader with Python's standard library:

```python
import math

spot, strike, rate, volatility, years = 120, 110, 0.03, 0.25, 0.75
normal_cdf = lambda x: (1 + math.erf(x / math.sqrt(2))) / 2
d1 = (math.log(spot / strike) + (rate + volatility**2 / 2) * years) / (
    volatility * math.sqrt(years)
)
d2 = d1 - volatility * math.sqrt(years)
call = spot * normal_cdf(d1) - strike * math.exp(-rate * years) * normal_cdf(d2)
put = strike * math.exp(-rate * years) * normal_cdf(-d2) - spot * normal_cdf(-d1)
print(call, put)  # 17.25406661081081, 4.806702702077807
```

The absolute tolerance of 0.005 allows rounding to cents. The incorrect option output keeps the call price correct but changes the put price, so every referenced field must be checked.
