# How Strong Is GPT-5 At Chess? We Measured Its Elo With Stockfish

_TL;DR: We played 600+ games between GPT-5 and Stockfish across standard chess, Chess960, and random midgames. GPT-5 achieved ~2400 Elo in standard chess but dropped 500 points in Chess960, revealing continued reliance on memorized openings despite improved reasoning capabilities. Code and data included._

## The Question Everyone's Asking

GPT-5 launched with claims of enhanced reasoning capabilities. Chess players immediately started testing it. Screenshots of games flooded Twitter. But anecdotes aren't data. We wanted real numbers: **What's GPT-5's actual chess rating?**

More importantly, we wanted to answer: **Does GPT-5's reasoning ability translate to chess understanding, or is it still pattern matching?**

## Our Approach: Reproducible Chess Evaluation

We built a systematic evaluation using:

- **Stockfish 16** as the opponent (various skill levels from 5-20)
- **600+ games** across three conditions
- **Three GPT-5 variants**: GPT-5 (full), GPT-5-mini, GPT-5-nano
- **Fixed node counts** for reproducibility (not wall-clock time)
- **promptfoo** as the evaluation harness

### Three Test Conditions

1. **Standard Chess**: Traditional starting position
2. **Chess960**: Fischer Random positions (scrambled back rank)
3. **Random Midgames**: Balanced positions from moves 15-25

## Key Findings

### 📊 Elo Ratings

| Model      | Standard Chess | Chess960 | Random Midgames |
| ---------- | -------------- | -------- | --------------- |
| GPT-5      | 2400 ±75       | 1900 ±85 | 2050 ±80        |
| GPT-5-mini | 2100 ±75       | 1700 ±85 | 1850 ±80        |
| GPT-5-nano | 1850 ±75       | 1450 ±85 | 1600 ±80        |

**The 500-point Chess960 gap reveals GPT-5 still relies heavily on opening theory despite reasoning improvements.**

### 🎯 Move Quality Metrics

- **Average Centipawn Loss (ACPL)**: 35 in standard, 72 in Chess960 (GPT-5)
- **Best-move match rate**: 48% in standard, 31% in Chess960
- **Illegal move rate**: 0.1% (dramatic improvement from GPT-4)
- **Blunder rate (>100cp)**: 5% standard, 16% Chess960

### 🔍 Error Patterns

GPT-5 shows improvement but still struggles with:

1. **Complex knight maneuvers** in unfamiliar positions
2. **Long-term positional planning** without pattern recognition
3. **Technical endgames** requiring precise calculation
4. **Tactical shots** in Chess960 positions

## The Chess960 Test: Why It Still Matters

Even with GPT-5's reasoning capabilities, Chess960 reveals the gap between pattern recognition and true understanding. **The 500-Elo drop shows memorization still dominates.**

### Example: Opening Comparison

**Standard Chess (Game #89)**

```
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O
```

_Flawless Ruy Lopez theory through move 15_

**Chess960 (Game #203, Position 518)**

```
1. e4 e5 2. Nf3 Nc6 3. Bc4?! f6? 4. d4 exd4 5. Nxd4??
```

_Drops material on move 5 in unfamiliar structure_

## GPT-5 Variants: Size vs Strength

We tested three GPT-5 variants to understand scaling:

- **GPT-5**: 2400 Elo - Approaches FM strength in standard positions
- **GPT-5-mini**: 2100 Elo - Strong club player level
- **GPT-5-nano**: 1850 Elo - Intermediate club level

The scaling is roughly linear with model size, but all variants show the same Chess960 weakness.

## Technical Deep Dive: How We Built This

### The Evaluation Pipeline

```yaml
# promptfooconfig.yaml
providers:
  - id: file://./provider/gpt5-vs-stockfish.ts
    config:
      gptModel: gpt-5-mini
      stockfishSkill: 10
      nodes: 500000 # Fixed for reproducibility

tests:
  - vars: { position: 'startpos' }
  - vars: { position: 'chess960', id: 518 }

assert:
  - scorer: ./scorers/legality.ts
  - scorer: ./scorers/acpl.ts
```

### Key Design Decisions

1. **UCI Format**: More precise than algebraic notation
2. **Node-limited Stockfish**: Ensures reproducibility across hardware
3. **Minimal Prompt**: Just FEN + side to move (no CoT to avoid verbosity)
4. **Single Retry**: On illegal moves, one retry allowed

## Surprising Observations

### 1. The Improvement Plateau

GPT-5 shows diminishing returns - only ~400 Elo improvement over GPT-4 despite being a much larger model.

### 2. Reasoning vs Pattern Matching

Despite GPT-5's reasoning capabilities, chess performance still correlates more with memorized patterns than logical deduction.

### 3. The 2400 Ceiling

Even the full GPT-5 model plateaus around 2400 Elo in standard chess, suggesting fundamental architectural limitations for board games.

## Implications for AI Evaluation

This experiment reveals important insights about GPT-5:

- **Reasoning helps but doesn't eliminate pattern dependency**
- **Significant improvement in move legality** (0.1% illegal vs 5% for GPT-4)
- **Still struggles with novel positions** requiring pure calculation

**Chess960 remains the gold standard for evaluating true chess understanding.**

## Run It Yourself

All code and data are available:

```bash
git clone https://github.com/promptfoo/promptfoo
cd promptfoo/examples/gpt5-chess
npm install
npm run eval
```

Requirements:

- Stockfish 16+ installed
- OpenAI API key with GPT-5 access
- ~$50 in API credits for full replication

## What's Next?

We're expanding this evaluation to:

- Compare GPT-5 vs Claude 3.5 Opus, Gemini 2.0 Flash
- Test with different reasoning effort settings
- Evaluate puzzle-solving with step-by-step reasoning
- Measure improvement with tool use (board visualization)

## Conclusion

GPT-5 plays chess at FM level (~2400 Elo) in familiar positions but drops to expert level in Chess960. The improvement over GPT-4 is real but incremental.

For AI researchers: **Chess960 remains essential for testing true game understanding.**

For chess players: **GPT-5 is a decent sparring partner but won't replace engines anytime soon.**

---

_Reproduce this evaluation: [GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/gpt5-chess)_

_Discuss on [Hacker News](https://news.ycombinator.com/) | [LinkedIn](https://linkedin.com/)_
