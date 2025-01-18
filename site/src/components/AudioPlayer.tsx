import React, { useEffect, useRef } from 'react';
import styles from './AudioPlayer.module.css';

interface AudioPlayerProps {
  audioData: string; // base64 encoded audio data
  format?: string;
  transcript?: string;
}

export default function AudioPlayer({
  audioData,
  format = 'wav',
  transcript,
}: AudioPlayerProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      const blob = new Blob([Buffer.from(audioData, 'base64')], { type: `audio/${format}` });
      const url = URL.createObjectURL(blob);
      audioRef.current.src = url;

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [audioData, format]);

  return (
    <div className={styles.audioContainer}>
      <audio ref={audioRef} controls className={styles.audioPlayer} />
      {transcript && (
        <div className={styles.transcript}>
          <span className={styles.transcriptLabel}>Transcript:</span>
          {transcript}
        </div>
      )}
    </div>
  );
}
