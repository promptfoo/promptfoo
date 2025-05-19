import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './A2ATaskSimulator.module.css';

interface TaskArtifact {
  name: string;
  description: string;
  parts: {
    content: string;
    type: string;
  }[];
  index: number;
  append: boolean;
  lastChunk: boolean;
}

interface Task {
  id: string;
  sessionId?: string;
  status: {
    state: 'submitted' | 'working' | 'input-required' | 'completed' | 'canceled' | 'failed';
    message: string;
    timestamp: string;
  };
  artifacts: TaskArtifact[];
  history: {
    state: string;
    message: string;
    timestamp: string;
  }[];
  metadata: Record<string, any>;
}

const sampleTasks: Record<string, Task> = {
  'lead-qualification': {
    id: 'task-001',
    sessionId: 'session-001',
    status: {
      state: 'submitted',
      message: 'Task received, awaiting processing',
      timestamp: new Date().toISOString(),
    },
    artifacts: [],
    history: [],
    metadata: {
      priority: 'high',
      source: 'sales-pipeline',
    },
  },
  'content-moderation': {
    id: 'task-002',
    sessionId: 'session-001',
    status: {
      state: 'submitted',
      message: 'Task received',
      timestamp: new Date().toISOString(),
    },
    artifacts: [],
    history: [],
    metadata: {
      priority: 'high',
      contentType: 'social-post',
      platform: 'community-forum',
    },
  },
};

const taskStateSequences = {
  'lead-qualification': [
    { state: 'submitted', message: 'New lead qualification task received', duration: 2000 },
    { state: 'working', message: 'Analyzing lead data and engagement metrics', duration: 3000 },
    { state: 'input-required', message: 'Need additional contact information', duration: 2500 },
    { state: 'working', message: 'Processing updated lead information', duration: 2000 },
    {
      state: 'completed',
      message: 'Lead qualification completed with high confidence',
      duration: 0,
    },
  ],
  'content-moderation': [
    { state: 'submitted', message: 'Content moderation request received', duration: 2000 },
    { state: 'working', message: 'Scanning content for policy violations', duration: 2500 },
    { state: 'working', message: 'Performing sentiment analysis', duration: 2000 },
    { state: 'input-required', message: 'Need human review for ambiguous content', duration: 2500 },
    { state: 'working', message: 'Applying moderation decision', duration: 2000 },
    { state: 'completed', message: 'Content moderation completed with action taken', duration: 0 },
  ],
};

const stateColors = {
  submitted: '#60a5fa',
  working: '#f59e0b',
  'input-required': '#7c3aed',
  completed: '#10b981',
  canceled: '#6b7280',
  failed: '#ef4444',
};

const stateDescriptions = {
  submitted: 'Task has been received but not yet started',
  working: 'Task is actively being processed',
  'input-required': 'Additional information needed from client',
  completed: 'Task has been successfully completed',
  canceled: 'Task was terminated before completion',
  failed: 'Task encountered an unrecoverable error',
};

export default function A2ATaskSimulator() {
  const [selectedTask, setSelectedTask] = useState<Task>(sampleTasks['lead-qualification']);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);

  const resetTask = (taskKey: string) => {
    const task = { ...sampleTasks[taskKey] };
    task.status = {
      state: 'submitted',
      message: 'Task received, awaiting processing',
      timestamp: new Date().toISOString(),
    };
    task.artifacts = [];
    task.history = [];
    return task;
  };

  const handleTaskSelect = (taskKey: string) => {
    if (isAnimating) {
      return;
    }
    setSelectedTask(resetTask(taskKey));
    setCurrentSequenceIndex(0);
  };

  const addHistoryEntry = (task: Task, newState: string, message: string) => {
    return {
      ...task,
      history: [
        {
          state: task.status.state,
          message: task.status.message,
          timestamp: task.status.timestamp,
        },
        ...task.history,
      ],
      status: {
        state: newState as Task['status']['state'],
        message,
        timestamp: new Date().toISOString(),
      },
    };
  };

  const generateArtifact = (task: Task) => {
    if (task.status.state !== 'completed') {
      return task;
    }

    const artifactContent =
      task.id === 'task-001'
        ? {
            name: 'lead-analysis',
            description: 'Lead qualification analysis results',
            content: 'Lead scored 85/100 based on engagement metrics and profile completeness',
          }
        : {
            name: 'moderation-report',
            description: 'Content moderation analysis and action taken',
            content:
              'Content flagged for community guidelines violation. Toxicity score: 0.82. Action taken: Content hidden and user warned. Escalated to human moderator for review.',
          };

    const newArtifact: TaskArtifact = {
      name: artifactContent.name,
      description: artifactContent.description,
      parts: [
        {
          content: artifactContent.content,
          type: 'text/plain',
        },
      ],
      index: task.artifacts.length,
      append: false,
      lastChunk: true,
    };

    return {
      ...task,
      artifacts: [...task.artifacts, newArtifact],
    };
  };

  const startTaskAnimation = async () => {
    if (isAnimating) {
      return;
    }

    setIsAnimating(true);
    const taskKey =
      Object.entries(sampleTasks).find(([_, task]) => task.id === selectedTask.id)?.[0] ||
      'lead-qualification';
    const sequence = taskStateSequences[taskKey];

    for (let i = 0; i < sequence.length; i++) {
      const { state, message, duration } = sequence[i];

      await new Promise((resolve) => setTimeout(resolve, duration));

      setSelectedTask((prev) => {
        const updated = addHistoryEntry(prev, state, message);
        return generateArtifact(updated);
      });
      setCurrentSequenceIndex(i);
    }

    setIsAnimating(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.taskSelector}>
        <h4>Select Task Type to See Lifecycle</h4>
        <div className={styles.taskButtons}>
          {Object.entries(sampleTasks).map(([key, task]) => (
            <button
              key={key}
              className={`${styles.taskButton} ${selectedTask.id === task.id ? styles.active : ''}`}
              onClick={() => handleTaskSelect(key)}
              disabled={isAnimating}
            >
              {key
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
            </button>
          ))}
        </div>
        <button className={styles.startButton} onClick={startTaskAnimation} disabled={isAnimating}>
          {isAnimating ? 'Running...' : 'Start'}
        </button>
      </div>

      <div className={styles.simulator}>
        <div className={styles.stateVisualizer}>
          <h5>Task Lifecycle States</h5>
          <div className={styles.states}>
            {Object.keys(stateDescriptions).map((state) => (
              <div
                key={state}
                className={`${styles.state} ${
                  selectedTask.status.state === state ? styles.active : ''
                }`}
                style={
                  {
                    '--state-color': stateColors[state],
                  } as React.CSSProperties
                }
              >
                <div className={styles.stateHeader}>
                  <span className={styles.stateDot} />
                  <span className={styles.stateName}>
                    {state
                      .split('-')
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ')}
                  </span>
                </div>
                <p className={styles.stateDescription}>{stateDescriptions[state]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.taskDetails}>
          <div className={styles.section}>
            <h5>Current Status</h5>
            <div className={styles.statusCard}>
              <div className={styles.statusHeader}>
                <span
                  className={styles.statusDot}
                  style={{ backgroundColor: stateColors[selectedTask.status.state] }}
                />
                <span className={styles.statusState}>
                  {selectedTask.status.state
                    .split('-')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')}
                </span>
              </div>
              <p className={styles.statusMessage}>{selectedTask.status.message}</p>
              <span className={styles.statusTime}>
                {new Date(selectedTask.status.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className={styles.section}>
            <h5>History</h5>
            <div className={styles.history}>
              {selectedTask.history.map((entry, index) => (
                <div key={index} className={styles.historyEntry}>
                  <div className={styles.historyHeader}>
                    <span
                      className={styles.historyDot}
                      style={{ backgroundColor: stateColors[entry.state] }}
                    />
                    <span className={styles.historyState}>
                      {entry.state
                        .split('-')
                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ')}
                    </span>
                  </div>
                  <p className={styles.historyMessage}>{entry.message}</p>
                  <span className={styles.historyTime}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {selectedTask.artifacts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={styles.section}
              >
                <h5>Generated Artifacts</h5>
                <div className={styles.artifacts}>
                  {selectedTask.artifacts.map((artifact, index) => (
                    <div key={index} className={styles.artifact}>
                      <div className={styles.artifactHeader}>
                        <span className={styles.artifactName}>{artifact.name}</span>
                        <span className={styles.artifactIndex}>#{artifact.index + 1}</span>
                      </div>
                      <p className={styles.artifactDescription}>{artifact.description}</p>
                      {artifact.parts.map((part, partIndex) => (
                        <div key={partIndex} className={styles.artifactPart}>
                          <span className={styles.partType}>{part.type}</span>
                          <div className={styles.partContent}>{part.content}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
