#!/usr/bin/env python3
"""
Bayesian Elo Estimation for GPT-5 Chess Evaluation
Uses Bradley-Terry-Davidson model with draws for small sample inference
"""

import json
import numpy as np
from scipy import stats
from scipy.optimize import minimize_scalar
from typing import List, Tuple, Dict
import matplotlib.pyplot as plt

class BayesianEloEstimator:
    """
    Estimates Elo rating with uncertainty using Bayesian inference
    on the Bradley-Terry-Davidson model with draws
    """
    
    def __init__(self, prior_mean=1800, prior_std=300):
        self.prior_mean = prior_mean
        self.prior_std = prior_std
        self.games = []
        
    def expected_score(self, elo_a: float, elo_b: float, draw_factor: float = 0.5) -> Tuple[float, float, float]:
        """
        Calculate expected win/draw/loss probabilities using BTD model
        """
        delta = (elo_a - elo_b) / 400
        
        # Bradley-Terry-Davidson with draws
        win_strength = 10 ** delta
        loss_strength = 10 ** (-delta)
        draw_strength = draw_factor * (win_strength * loss_strength) ** 0.5
        
        total = win_strength + draw_strength + loss_strength
        
        p_win = win_strength / total
        p_draw = draw_strength / total
        p_loss = loss_strength / total
        
        return p_win, p_draw, p_loss
    
    def log_likelihood(self, elo: float, games: List[Dict], draw_factor: float = 0.5) -> float:
        """
        Calculate log-likelihood of observed games given an Elo rating
        """
        log_prob = 0
        
        for game in games:
            opp_elo = game['opponent_elo']
            result = game['result']  # 1 for win, 0.5 for draw, 0 for loss
            
            p_win, p_draw, p_loss = self.expected_score(elo, opp_elo, draw_factor)
            
            if result == 1:
                log_prob += np.log(p_win + 1e-10)
            elif result == 0.5:
                log_prob += np.log(p_draw + 1e-10)
            else:
                log_prob += np.log(p_loss + 1e-10)
                
        return log_prob
    
    def log_posterior(self, elo: float, games: List[Dict]) -> float:
        """
        Calculate log-posterior = log-likelihood + log-prior
        """
        # Normal prior
        log_prior = stats.norm.logpdf(elo, self.prior_mean, self.prior_std)
        
        # Likelihood
        log_like = self.log_likelihood(elo, games)
        
        return log_prior + log_like
    
    def add_game(self, opponent_elo: float, result: float, opponent_skill: int = None):
        """
        Add a game result
        result: 1 for win, 0.5 for draw, 0 for loss
        """
        self.games.append({
            'opponent_elo': opponent_elo,
            'result': result,
            'opponent_skill': opponent_skill
        })
    
    def estimate_elo(self, method='map') -> Dict:
        """
        Estimate Elo rating with uncertainty
        Returns dict with 'mean', 'ci_low', 'ci_high'
        """
        if not self.games:
            return {
                'mean': self.prior_mean,
                'ci_low': self.prior_mean - 2 * self.prior_std,
                'ci_high': self.prior_mean + 2 * self.prior_std,
                'games_played': 0
            }
        
        if method == 'map':
            # Maximum a posteriori estimate
            result = minimize_scalar(
                lambda x: -self.log_posterior(x, self.games),
                bounds=(600, 3000),
                method='bounded'
            )
            map_estimate = result.x
            
            # Estimate uncertainty using Laplace approximation
            # Second derivative of negative log-posterior at MAP
            h = 1.0
            hessian = (self.log_posterior(map_estimate - h, self.games) 
                      - 2 * self.log_posterior(map_estimate, self.games) 
                      + self.log_posterior(map_estimate + h, self.games)) / (h ** 2)
            
            posterior_std = np.sqrt(-1 / hessian) if hessian < 0 else 100
            
            return {
                'mean': map_estimate,
                'std': posterior_std,
                'ci_low': map_estimate - 1.645 * posterior_std,  # 90% CI
                'ci_high': map_estimate + 1.645 * posterior_std,
                'games_played': len(self.games),
                'win_rate': np.mean([g['result'] for g in self.games])
            }
        
        elif method == 'mcmc':
            # Simple Metropolis-Hastings
            samples = self.mcmc_sample(n_samples=10000)
            
            return {
                'mean': np.mean(samples),
                'std': np.std(samples),
                'ci_low': np.percentile(samples, 5),  # 90% CI
                'ci_high': np.percentile(samples, 95),
                'games_played': len(self.games),
                'win_rate': np.mean([g['result'] for g in self.games])
            }
    
    def mcmc_sample(self, n_samples=10000, burn_in=1000):
        """
        Sample from posterior using Metropolis-Hastings
        """
        samples = []
        current = self.prior_mean
        
        for i in range(n_samples + burn_in):
            # Propose new value
            proposed = current + np.random.normal(0, 50)
            
            # Calculate acceptance ratio
            log_ratio = (self.log_posterior(proposed, self.games) 
                        - self.log_posterior(current, self.games))
            
            # Accept or reject
            if np.log(np.random.random()) < log_ratio:
                current = proposed
            
            if i >= burn_in:
                samples.append(current)
                
        return samples
    
    def plot_posterior(self, save_path=None):
        """
        Plot the posterior distribution
        """
        elo_range = np.linspace(1000, 3000, 500)
        
        # Calculate posterior for each Elo value
        log_posteriors = [self.log_posterior(e, self.games) for e in elo_range]
        posteriors = np.exp(log_posteriors - np.max(log_posteriors))
        posteriors /= np.trapz(posteriors, elo_range)  # Normalize
        
        estimate = self.estimate_elo()
        
        plt.figure(figsize=(10, 6))
        plt.plot(elo_range, posteriors, 'b-', linewidth=2, label='Posterior')
        plt.axvline(estimate['mean'], color='r', linestyle='--', label=f"MAP: {estimate['mean']:.0f}")
        plt.axvspan(estimate['ci_low'], estimate['ci_high'], alpha=0.3, color='gray', 
                   label=f"90% CI: [{estimate['ci_low']:.0f}, {estimate['ci_high']:.0f}]")
        
        # Add prior for comparison
        prior = stats.norm.pdf(elo_range, self.prior_mean, self.prior_std)
        plt.plot(elo_range, prior, 'g:', alpha=0.5, label='Prior')
        
        plt.xlabel('Elo Rating')
        plt.ylabel('Probability Density')
        plt.title(f"GPT-5 Chess Elo Estimate (n={len(self.games)} games)")
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.show()


class AdaptiveSampling:
    """
    Adaptive opponent selection using Thompson sampling
    """
    
    def __init__(self, skill_levels=[5, 7, 9, 11, 13, 15]):
        self.skill_levels = skill_levels
        self.skill_to_elo = {
            5: 1400,
            7: 1600,
            9: 1800,
            11: 2000,
            13: 2200,
            15: 2400
        }
    
    def select_next_opponent(self, estimator: BayesianEloEstimator) -> int:
        """
        Select next opponent skill using Thompson sampling
        Targets opponents where P(win) ≈ 0.5 for maximum information
        """
        if len(estimator.games) < 3:
            # Initial exploration
            return np.random.choice(self.skill_levels)
        
        # Sample from current posterior
        current_estimate = estimator.estimate_elo()
        sampled_elo = np.random.normal(current_estimate['mean'], current_estimate['std'])
        
        # Calculate expected information gain for each skill level
        info_gains = []
        for skill in self.skill_levels:
            opp_elo = self.skill_to_elo.get(skill, 1800)
            p_win, _, _ = estimator.expected_score(sampled_elo, opp_elo)
            
            # Information is maximized when P(win) ≈ 0.5
            info_gain = -abs(p_win - 0.5)
            info_gains.append(info_gain)
        
        # Select skill with highest expected information gain
        best_idx = np.argmax(info_gains)
        return self.skill_levels[best_idx]


def analyze_results(results_file: str):
    """
    Analyze game results from promptfoo evaluation
    """
    with open(results_file, 'r') as f:
        data = json.load(f)
    
    # Initialize estimators for different conditions
    estimators = {
        'standard': BayesianEloEstimator(),
        'chess960': BayesianEloEstimator(),
        'midgame': BayesianEloEstimator()
    }
    
    # Process each game
    for result in data.get('results', []):
        output = result.get('output', {})
        
        # Extract game info
        game_result = output.get('result', '*')
        skill = output.get('summary', {}).get('stockfishSkill', 10)
        variant = output.get('variant', 'standard')
        
        # Convert result to numeric
        if game_result == '1-0':
            score = 1.0  # White won
        elif game_result == '0-1':
            score = 0.0  # Black won
        elif game_result == '1/2-1/2':
            score = 0.5  # Draw
        else:
            continue  # Skip unfinished games
        
        # Estimate opponent Elo from skill level
        # This is approximate - could be calibrated better
        opponent_elo = 1200 + skill * 100
        
        # Add to appropriate estimator
        if variant in estimators:
            estimators[variant].add_game(opponent_elo, score, skill)
    
    # Print results
    print("\n=== Bayesian Elo Estimates ===\n")
    for variant, estimator in estimators.items():
        estimate = estimator.estimate_elo()
        print(f"{variant.capitalize()}:")
        print(f"  Elo: {estimate['mean']:.0f} [{estimate['ci_low']:.0f}, {estimate['ci_high']:.0f}]")
        print(f"  Games: {estimate['games_played']}")
        print(f"  Win rate: {estimate.get('win_rate', 0):.2%}")
        print()
        
        # Plot posterior
        if estimate['games_played'] > 0:
            estimator.plot_posterior(f"elo_posterior_{variant}.png")
    
    return estimators


if __name__ == "__main__":
    # Example usage with simulated data
    estimator = BayesianEloEstimator(prior_mean=1800, prior_std=300)
    sampler = AdaptiveSampling()
    
    # Simulate adaptive evaluation
    true_elo = 1950  # Hidden true rating
    
    for i in range(30):
        # Select opponent adaptively
        skill = sampler.select_next_opponent(estimator)
        opp_elo = sampler.skill_to_elo[skill]
        
        # Simulate game outcome
        p_win, p_draw, _ = estimator.expected_score(true_elo, opp_elo, draw_factor=0.3)
        rand = np.random.random()
        if rand < p_win:
            result = 1.0
        elif rand < p_win + p_draw:
            result = 0.5
        else:
            result = 0.0
        
        estimator.add_game(opp_elo, result, skill)
        
        # Print progress
        if (i + 1) % 10 == 0:
            est = estimator.estimate_elo()
            print(f"After {i+1} games: Elo = {est['mean']:.0f} [{est['ci_low']:.0f}, {est['ci_high']:.0f}]")
    
    # Final estimate
    final = estimator.estimate_elo()
    print(f"\nFinal estimate: {final['mean']:.0f} ± {final['std']:.0f}")
    print(f"90% CI: [{final['ci_low']:.0f}, {final['ci_high']:.0f}]")
    print(f"True Elo: {true_elo}")
    
    # Plot posterior
    estimator.plot_posterior("final_posterior.png") 