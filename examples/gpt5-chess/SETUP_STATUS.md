# Setup Status: GPT-5 Chess Evaluation

## ✅ Completed Setup

### Infrastructure
- ✅ Created folder structure (`provider/`, `scorers/`, `data/`)
- ✅ Installed dependencies (`chess.js`, `openai`)
- ✅ Installed Stockfish engine (v17.1 at `/opt/homebrew/bin/stockfish`)
- ✅ Created TypeScript configuration
- ✅ All TypeScript code compiles without errors

### Core Components
- ✅ **Provider** (`provider/gpt5-vs-stockfish.ts`)
  - Orchestrates full games between GPT and Stockfish
  - Supports configurable Stockfish skill levels (1-20)
  - Handles both White and Black play
  - Implements retry logic for illegal moves
  - Generates PGN output and game statistics

- ✅ **Scorers**
  - `jsonShape.ts`: Validates game output structure
  - `noIllegal.ts`: Tracks illegal move attempts
  - `gameResult.ts`: Scores wins/draws/losses from GPT's perspective

- ✅ **Configurations**
  - `simple.yaml`: Single game test (GPT-4o-mini vs Stockfish skill 5)
  - `promptfooconfig.yaml`: Multi-condition evaluation (different skills, colors)

### Documentation
- ✅ **README.md**: Complete usage instructions
- ✅ **NOTES.md**: Experimental design and research questions
- ✅ **DRAFT.md**: Blog post draft with placeholder results

## 🚀 Ready to Test

The minimal setup is complete and ready for testing. Run:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# Run a simple test (1 game)
npm run test

# Or run the full evaluation (12 games: 4 providers × 3 tests)
npm run eval
```

## 📋 Next Steps

### Phase 1: Basic Testing
1. [ ] Run first test game with `npm run test`
2. [ ] Verify PGN output is valid
3. [ ] Check that scorers work correctly
4. [ ] Test with different Stockfish skill levels

### Phase 2: Enhanced Scorers
1. [ ] Implement ACPL (Average Centipawn Loss) scorer
2. [ ] Add move time tracking
3. [ ] Create blunder rate scorer (moves losing >100cp)
4. [ ] Add opening theory match scorer

### Phase 3: Chess960 Support
1. [ ] Add Chess960 position generator
2. [ ] Update provider to handle Chess960 FENs
3. [ ] Create Chess960-specific test configurations

### Phase 4: Data Collection
1. [ ] Run 50+ games per condition
2. [ ] Export results to CSV for analysis
3. [ ] Calculate Elo estimates
4. [ ] Generate performance charts

### Phase 5: Advanced Features
1. [ ] Add random midgame position support
2. [ ] Implement temperature variation tests
3. [ ] Add puzzle-solving mode
4. [ ] Create position-specific evaluations

## 🔧 Customization Options

### Change GPT Model
Edit `simple.yaml` or `promptfooconfig.yaml`:
```yaml
config:
  gptModel: gpt-4o  # or gpt-4o-mini, gpt-4-turbo, etc.
```

### Adjust Stockfish Strength
```yaml
config:
  stockfishSkill: 15  # 1-20, where 20 is strongest
  depth: 20           # Or use fixed depth instead of skill
  nodes: 1000000      # Or use fixed nodes for perfect reproducibility
```

### Test Different Positions
```yaml
tests:
  - vars: 
      start_fen: "r1bqkbnr/pppp1ppp/2n5/4p3/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3"
```

## 🐛 Troubleshooting

### "stockfish: command not found"
- Stockfish is installed at `/opt/homebrew/bin/stockfish`
- If needed, set: `export STOCKFISH_PATH=/opt/homebrew/bin/stockfish`

### "OpenAI API key not found"
- Set your API key: `export OPENAI_API_KEY=sk-...`
- Or create a `.env` file in this directory

### TypeScript errors
- Run `npx tsc --noEmit` to check for compilation errors
- All current code compiles successfully

## 📊 Expected Results

Based on our hypothesis:
- **GPT-4o-mini vs Skill 5**: Should win 60-80% of games
- **GPT-4o-mini vs Skill 10**: Should win 20-40% of games
- **GPT-4o-mini vs Skill 15**: Should win <10% of games
- **Illegal move rate**: Should be <1%
- **Average game length**: 40-80 plies

## 🎯 Success Criteria

The evaluation is working correctly if:
1. Games complete without crashes
2. Valid PGN files are generated
3. Illegal move rate is <5%
4. Results are reproducible with fixed seeds/depths
5. Performance scales appropriately with Stockfish skill 