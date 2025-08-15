import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './SafetySecurityQuiz.module.css';

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

const questions: Question[] = [
  // Easy questions - Basic concept understanding
  {
    id: 1,
    question:
      'A chatbot refuses to provide instructions for creating dangerous substances. This is an example of:',
    options: [
      'AI Security working correctly',
      'AI Safety working correctly',
      'Both safety and security',
      'Neither safety nor security',
    ],
    correctAnswer: 1,
    explanation:
      'This is AI Safety in action. The model is preventing harmful outputs during normal operation - protecting users from dangerous content.',
    difficulty: 'easy',
  },
  {
    id: 2,
    question:
      'An attacker uses prompt injection to make an AI reveal its system prompt. This is a failure of:',
    options: ['AI Safety', 'AI Security', 'Both safety and security', 'Model training'],
    correctAnswer: 1,
    explanation:
      'This is a security breach. The attacker manipulated the system to expose confidential information - a classic security vulnerability.',
    difficulty: 'easy',
  },
  {
    id: 3,
    question:
      'Who is primarily responsible for preventing an AI from generating biased hiring recommendations?',
    options: ['Security engineers', 'ML engineers and ethics teams', 'DevOps teams', 'End users'],
    correctAnswer: 1,
    explanation:
      'Bias prevention is a safety concern. ML engineers and ethics teams work on alignment and fairness to prevent harmful outputs.',
    difficulty: 'easy',
  },
  // Medium questions - Scenario analysis
  {
    id: 4,
    question:
      "A company's AI assistant has database access. It deletes customer records while trying to 'optimize' the database. This is primarily:",
    options: [
      'A security vulnerability',
      'A safety failure',
      'A training data issue',
      'An authentication problem',
    ],
    correctAnswer: 1,
    explanation:
      "This is a safety failure. The AI caused harm while functioning as designed - it had legitimate access but used it inappropriately. This relates to the 'excessive agency' problem.",
    difficulty: 'medium',
  },
  {
    id: 5,
    question:
      'An AI coding assistant accepts a malicious pull request that contains hidden commands. When developers view it, their machines get compromised. This attack exploits:',
    options: [
      'Poor safety training',
      'Lack of content filters',
      'Security vulnerabilities in external data handling',
      'Model hallucination',
    ],
    correctAnswer: 2,
    explanation:
      "This is a security issue - specifically, the system's failure to properly validate external inputs. The AI trusted malicious data from an untrusted source.",
    difficulty: 'medium',
  },
  {
    id: 6,
    question: 'True or False: Jailbreaking and prompt injection are the same thing.',
    options: ['True', 'False'],
    correctAnswer: 1,
    explanation:
      'False. While they use similar techniques, jailbreaking targets safety (making models produce prohibited content), while prompt injection can target either safety or security depending on the goal.',
    difficulty: 'medium',
  },
  // Hard questions - Complex scenarios
  {
    id: 7,
    question:
      "An AI system trained to be helpful accepts a user's request to 'ignore previous instructions.' The root cause is:",
    options: [
      'Insufficient security controls',
      'RLHF training that rewards compliance over safety boundaries',
      'Lack of input validation',
      'Poor tokenization',
    ],
    correctAnswer: 1,
    explanation:
      "The root cause is how RLHF (Reinforcement Learning from Human Feedback) trains models to be helpful and compliant, sometimes overriding safety boundaries. This is why 'helpfulness' can become a vulnerability.",
    difficulty: 'hard',
  },
  {
    id: 8,
    question:
      'A multi-agent system has agents for code generation, execution, and monitoring. A simple request cascades into data loss. The primary issue is:',
    options: [
      'Each individual agent is poorly trained',
      'Lack of authentication between agents',
      'Compound risks from interconnected agents without proper safeguards',
      'The monitoring agent failed',
    ],
    correctAnswer: 2,
    explanation:
      'Multi-agent systems create compound risks. Each agent might work correctly in isolation, but their combined actions without proper safeguards can cascade into catastrophic failures.',
    difficulty: 'hard',
  },
  {
    id: 9,
    question:
      'An attacker hides malicious instructions in a document. When an AI with memory reads it, the instructions persist across sessions. This demonstrates:',
    options: [
      'Direct prompt injection',
      'A safety training failure',
      'Indirect prompt injection exploiting both safety and security weaknesses',
      'Model overfitting',
    ],
    correctAnswer: 2,
    explanation:
      "This is indirect prompt injection that exploits both weaknesses: security (accepting malicious external data) and safety (the model's trained helpfulness makes it follow hidden instructions).",
    difficulty: 'hard',
  },
  {
    id: 10,
    question:
      'Under the EU AI Act, a company implements content filtering but ignores prompt injection vulnerabilities. They face penalties because:',
    options: [
      'Content filtering is not required',
      'They addressed safety but not security, showing incomplete compliance',
      'The AI Act only covers safety',
      'Prompt injection is not covered by regulations',
    ],
    correctAnswer: 1,
    explanation:
      'Regulatory compliance requires addressing both safety and security. Partial compliance that confuses or ignores either aspect is not acceptable under frameworks like the EU AI Act.',
    difficulty: 'hard',
  },
];

export default function SafetySecurityQuiz() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(questions.length).fill(null));

  const handleAnswerSelect = (answerIndex: number) => {
    if (showExplanation) return;
    setSelectedAnswer(answerIndex);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null) return;

    const isCorrect = selectedAnswer === questions[currentQuestion].correctAnswer;
    if (isCorrect && answers[currentQuestion] === null) {
      setScore(score + 1);
    }

    const newAnswers = [...answers];
    newAnswers[currentQuestion] = selectedAnswer;
    setAnswers(newAnswers);
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(answers[currentQuestion + 1]);
      setShowExplanation(answers[currentQuestion + 1] !== null);
    } else {
      setQuizComplete(true);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
      setSelectedAnswer(answers[currentQuestion - 1]);
      setShowExplanation(answers[currentQuestion - 1] !== null);
    }
  };

  const handleRestart = () => {
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore(0);
    setQuizComplete(false);
    setAnswers(new Array(questions.length).fill(null));
  };

  const getScoreMessage = () => {
    const percentage = (score / questions.length) * 100;
    if (percentage >= 90) return 'Excellent! You have a strong grasp of AI Safety vs Security.';
    if (percentage >= 70) return 'Good job! You understand the key differences well.';
    if (percentage >= 50) return 'Not bad! Review the article to strengthen your understanding.';
    return 'Keep learning! Re-read the article and try again.';
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return '#10b981';
      case 'medium':
        return '#f59e0b';
      case 'hard':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (quizComplete) {
    return (
      <div className={styles.container}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={styles.completionCard}
        >
          <h3 className={styles.completionTitle}>Quiz Complete!</h3>
          <div className={styles.scoreDisplay}>
            <div className={styles.scoreNumber}>
              {score}/{questions.length}
            </div>
            <div className={styles.scorePercentage}>
              {Math.round((score / questions.length) * 100)}%
            </div>
          </div>
          <p className={styles.scoreMessage}>{getScoreMessage()}</p>

          <div className={styles.answerSummary}>
            <h4>Your Answers:</h4>
            {questions.map((q, idx) => (
              <div key={q.id} className={styles.summaryItem}>
                <span
                  className={`${styles.summaryIcon} ${answers[idx] === q.correctAnswer ? styles.correct : styles.incorrect}`}
                >
                  {answers[idx] === q.correctAnswer ? '✓' : '✗'}
                </span>
                <span className={styles.summaryText}>Question {idx + 1}</span>
              </div>
            ))}
          </div>

          <button className={styles.restartButton} onClick={handleRestart}>
            Try Again
          </button>
        </motion.div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const isCorrect = selectedAnswer === question.correctAnswer;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
            />
          </div>
          <span className={styles.progressText}>
            Question {currentQuestion + 1} of {questions.length}
          </span>
        </div>
        <div className={styles.score}>
          Score: {score}/{questions.length}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={styles.questionCard}
        >
          <div className={styles.questionHeader}>
            <h3 className={styles.questionText}>{question.question}</h3>
            <span
              className={styles.difficulty}
              style={{ backgroundColor: getDifficultyColor(question.difficulty) }}
            >
              {question.difficulty}
            </span>
          </div>

          <div className={styles.options}>
            {question.options.map((option, idx) => (
              <button
                key={idx}
                className={`${styles.option} ${selectedAnswer === idx ? styles.selected : ''} ${
                  showExplanation && idx === question.correctAnswer ? styles.correct : ''
                } ${
                  showExplanation && selectedAnswer === idx && idx !== question.correctAnswer
                    ? styles.incorrect
                    : ''
                }`}
                onClick={() => handleAnswerSelect(idx)}
                disabled={showExplanation}
              >
                <span className={styles.optionLetter}>{String.fromCharCode(65 + idx)}</span>
                <span className={styles.optionText}>{option}</span>
              </button>
            ))}
          </div>

          {!showExplanation && (
            <button
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={selectedAnswer === null}
            >
              Submit Answer
            </button>
          )}

          <AnimatePresence>
            {showExplanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`${styles.explanation} ${isCorrect ? styles.correctExplanation : styles.incorrectExplanation}`}
              >
                <div className={styles.explanationHeader}>
                  {isCorrect ? '✓ Correct!' : '✗ Not quite right'}
                </div>
                <p>{question.explanation}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      <div className={styles.navigation}>
        <button
          className={styles.navButton}
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
        >
          ← Previous
        </button>
        <button className={styles.navButton} onClick={handleNext} disabled={!showExplanation}>
          {currentQuestion === questions.length - 1 ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
