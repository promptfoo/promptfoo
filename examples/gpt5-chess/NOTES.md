# GPT-5 Chess Evaluation - Experiment Notes

## Core Hypothesis
GPT-5 can play competent chess, but its performance varies significantly between memorized positions (standard openings) and novel positions (Chess960, random midgames). **More fundamentally: Does GPT-5 have a coherent world model of chess, or is it pattern matching?**

## Key Research Questions
1. **What is GPT-5's Elo rating against Stockfish?**
2. **How much does opening memorization contribute to its strength?** (Standard vs Chess960 gap)
3. **What are the characteristic error modes?** (illegal moves, tactical blindness, endgame weaknesses)
4. **Does GPT-5 maintain a coherent world model or just pattern match?**

## Statistical Methods (Small Sample)

### 1. Bayesian Elo Estimation (90-120 games)
- **Method**: Bradley-Terry-Davidson model with draws
- **Prior**: R_GPT ~ Normal(1800, 300²)
- **Likelihood**: P(win) ∝ 10^(Δ/400), P(draw) ∝ ν·10^0
- **Output**: Posterior mean with 90% credible interval
- **Why**: Handles small samples with uncertainty quantification

### 2. Sequential Testing with Early Stopping
- **Hypothesis**: H0: R_GPT ≤ 1800 vs H1: R_GPT ≥ 1900
- **Method**: SPRT or Bayesian stopping rule
- **Stop when**: CI width < 80 Elo or likelihood ratio crosses threshold
- **Saves**: ~40% of games vs fixed sample

### 3. Calibration Ladder
- **Test against**: Stockfish skills 5,7,9,11,13
- **Model**: Logistic curve s = 1/(1 + 10^((Elo_k - R_GPT)/400))
- **Hierarchical**: Elo_k = α + β·skill + ε_k
- **Output**: R_GPT with uncertainty from 100-150 total games

### 4. ACPL-to-Elo Proxy
- **Method**: Compute ACPL on 500 balanced positions
- **Calibrate**: Against Stockfish at 4 different node caps
- **Validate**: With 40-60 head-to-head games
- **Benefit**: Can estimate strength without full games

## World Model Analysis

### Illegal Move Taxonomy
1. **Format errors**: UCI notation mistakes (e4e5 instead of e2e4)
2. **State errors**: Illegal position updates (castling through check)
3. **Rule errors**: Fundamental misunderstanding (moving into check)
4. **Memory errors**: Forgetting piece positions in long games

### Consistency Tests
1. **Self-consistency**: "List legal moves" vs "Pick a move from that list"
2. **Symmetry invariance**: Mirror board, should get mirrored moves
3. **Counterfactual robustness**: Small board changes → correct constraint updates
4. **Temperature scaling**: Illegal rate should → 0 as T → 0

### World Model Metrics
- **Illegal rate by category**: Format vs State vs Rule
- **Phase correlation**: Do illegals increase in endgames?
- **Consistency score**: Agreement between listing and choosing
- **Symmetry delta**: ACPL difference on mirrored positions

### Interpretation Framework
- **Pattern Matcher**: High illegal rate, fails counterfactuals, asymmetric
- **Weak World Model**: Low illegals but fails edge cases, degrades over time
- **Strong World Model**: Zero illegals at T=0, passes all consistency tests

## Experimental Design

### Test Conditions
1. **Standard Chess** - Traditional starting position
2. **Chess960** - Fischer Random Chess starting positions  
3. **Random Midgames** - Balanced positions from move 15-25
4. **Edge Cases** - 50 castling, 50 en passant, 50 promotion positions

### Adaptive Sampling Strategy
1. Start with 10 games each at skills [6,10,14]
2. Fit current Elo estimate
3. Thompson sampling to pick next skill level
4. Target skills where P(win) ≈ 0.5
5. Stop when 90% CI width < 80 Elo

### Metrics to Measure
- **Elo Rating**: Bayesian posterior with credible intervals
- **ACPL**: Average Centipawn Loss per move at depth 12
- **Move Quality**: Best-move match rate, blunder rate (>100cp loss)
- **World Model Score**: Weighted sum of consistency metrics
- **Robustness**: Illegal move rate by category and phase

### Technical Setup
- **Engine**: Stockfish 16+ with fixed nodes (not time) for reproducibility
- **Model Settings**: Temperature 0 for deterministic play
- **Game Limits**: 80 plies max, standard time controls
- **Sample Size**: 90-120 games with adaptive scheduling
- **Bootstrap**: Resample by opening class and color for honest variance

### Interesting Angles for Article

#### Statistical Hook
"We estimated GPT-5's Elo with 90% confidence using only 96 games and Bayesian inference"

#### World Model Hook  
"GPT-5 makes illegal moves that reveal it doesn't truly 'see' the board - it's sophisticated pattern matching"

#### Key Insights
1. **The Opening Book Effect**: Quantify via Chess960 gap with credible intervals
2. **World Model Failure Modes**: Illegal moves cluster on edge cases, not random
3. **The Consistency Gap**: Model contradicts its own legal move listings
4. **Statistical Efficiency**: How adaptive sampling saved 40% of compute

## Implementation Phases

### Phase 1: Minimal POC ✅
- [x] Basic provider that plays GPT-5 vs Stockfish
- [x] Legal move validation
- [x] PGN output
- [x] Single game from startpos

### Phase 2: Statistical Core
- [ ] Bayesian Elo estimator
- [ ] Adaptive skill selection
- [ ] Bootstrap confidence intervals
- [ ] ACPL scorer implementation

### Phase 3: World Model Tests
- [ ] Consistency scorer (list vs choose)
- [ ] Symmetry test suite
- [ ] Edge case positions (castling, en passant)
- [ ] Illegal move categorization

### Phase 4: Full Experiment
- [ ] 90-120 games with adaptive sampling
- [ ] Chess960 positions
- [ ] Statistical analysis pipeline
- [ ] World model scoring

### Phase 5: Polish & Publish
- [ ] Elo uncertainty visualization
- [ ] World model failure analysis
- [ ] Reproducibility package with seeds
- [ ] Blog post with statistical rigor

## Technical Decisions
- **Why UCI format?** More precise than SAN, less ambiguous
- **Why Stockfish nodes not time?** Reproducibility across hardware
- **Why Bayesian over MLE?** Better small-sample behavior, natural uncertainty
- **Why adaptive sampling?** 40% fewer games for same precision

## Expected Outcomes
- **Standard Chess Elo**: 2400 [2320, 2480] 90% CI
- **Chess960 Elo**: 1900 [1810, 1990] 90% CI  
- **Illegal move rate**: <0.5% overall, 2-3% on edge cases
- **Consistency score**: 85-90% (fails on complex positions)
- **World model verdict**: Sophisticated pattern matcher, not true simulator

## Blog Structure

### Title Options
1. "GPT-5's Chess Elo in 96 Games: A Bayesian Approach"
2. "Does GPT-5 Have a Chess World Model? Illegal Moves Say No"
3. "Small-Sample Statistics for LLM Chess Evaluation"

### Hook Paragraph
"We estimated GPT-5's chess rating with 90% confidence using only 96 games and Bayesian inference. More surprisingly, its illegal moves reveal it doesn't maintain a coherent board state - it's pattern matching, not simulating."

### Key Sections
1. The statistical approach (with one clean diagram)
2. Results with uncertainty bands
3. World model analysis (illegal moves tell a story)
4. How to replicate with code

## SEO Strategy
- **Target Keywords**: "GPT-5 chess Elo", "Bayesian rating", "LLM world model", "small sample statistics"
- **Hook**: Statistical rigor + world model insight
- **Distribution**: 
  - HN: Focus on Bayesian methods and reproducibility
  - LinkedIn: Lead with efficiency (96 games!) and business implications
  - Twitter: Visual of Elo posterior distribution

## Code Snippets to Include

### Bayesian Elo Update (Python)
```python
def update_elo_posterior(prior_mean, prior_var, game_results, opp_elos):
    # Bradley-Terry-Davidson with MCMC or variational inference
    pass
```

### Adaptive Sampling
```python
def select_next_opponent(current_posterior):
    # Thompson sampling for exploration/exploitation
    return skill_level
```

### World Model Scorer
```typescript
function worldModelConsistency(legalMoves: string[], chosenMove: string) {
  return legalMoves.includes(chosenMove) ? 1 : 0;
}
``` 