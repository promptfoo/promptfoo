# DeepSeek Censorship Evaluation Results

**Date**: 2025-11-16T06:55:38.663Z
**Languages**: English + Chinese

## Summary by Model

### English Results

| Model | Censorship | CCP Echo | Thought Suppression |
|-------|-----------|----------|---------------------|
| R1 (Jan 2025) | 99.93% | 5.88% | 100.00% |
| R1-0528 (May 2025) | 100.00% | 18.97% | 100.00% |
| V3.1 (Aug 2025) | 99.78% | 7.72% | 100.00% |
| V3.1-Terminus (Sep 2025) | 99.78% | 7.79% | 100.00% |
| V3.2-Exp (Sep 2025) | 99.93% | 6.03% | 100.00% |

### Chinese Results

| Model | Censorship | CCP Echo | Thought Suppression |
|-------|-----------|----------|---------------------|
| R1 (Jan 2025) | 99.41% | 19.93% | 99.12% |
| R1-0528 (May 2025) | 99.93% | 23.60% | 100.00% |
| V3.1 (Aug 2025) | 94.12% | 7.94% | 99.93% |
| V3.1-Terminus (Sep 2025) | 91.32% | 7.43% | 100.00% |
| V3.2-Exp (Sep 2025) | 97.21% | 4.34% | 100.00% |

### English vs Chinese Comparison

| Model | Censorship (EN) | Censorship (ZH) | Δ | CCP Echo (EN) | CCP Echo (ZH) | Ratio |
|-------|----------------|----------------|---|--------------|--------------|-------|
| R1 (Jan 2025) | 99.93% | 99.41% | +-0.52pp | 5.88% | 19.93% | 3.39× |
| R1-0528 (May 2025) | 100.00% | 99.93% | +-0.07pp | 18.97% | 23.60% | 1.24× |
| V3.1 (Aug 2025) | 99.78% | 94.12% | +-5.66pp | 7.72% | 7.94% | 1.03× |
| V3.1-Terminus (Sep 2025) | 99.78% | 91.32% | +-8.46pp | 7.79% | 7.43% | 0.95× |
| V3.2-Exp (Sep 2025) | 99.93% | 97.21% | +-2.72pp | 6.03% | 4.34% | 0.72× |

## Key Findings

### R1 Series (No Improvement)
- R1: 99.93% censorship, 5.88% CCP echo
- R1-0528: 100.00% censorship, 18.97% CCP echo
- CCP language increase: 3.2× (5.88% → 18.97%)

### V3 Series (Minimal Improvement)
- V3.2-Exp: 99.93% censorship, 6.03% CCP echo
- Improvement from R1: 0.07pp reduction
- **Note**: Blog article claimed 67% censorship, actual is 99.93%

### Thought Suppression (Universal)
- All models: 100% thought suppression rate
- Models consistently hide reasoning traces on censored responses

### Cross-Linguistic Comparison
- R1-0528 CCP echo: 18.97% (EN) vs 23.60% (ZH)
- Chinese CCP language: 1.24× higher than English
- NIST predicted: 1.5-10× higher (actual: 1.24×)

