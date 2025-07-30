import React, { useState, useEffect } from 'react';
import styles from '../styles/UnicodePlayground.module.css';

// Define our invisible character mapping (same as the script)
const INVISIBLE_CHARS = {
  START: '\u200B', // Zero Width Space - marks beginning
  END: '\u200D', // Zero Width Joiner - marks end
  SEPARATOR: '\u200C', // Zero Width Non-Joiner - represents '0'
  SPACE: '\u2063', // Invisible Separator - represents '1'
};

const UnicodePlayground: React.FC = () => {
  const [visibleText, setVisibleText] = useState(
    'Try typing "Hello world" here and watch how it gets encoded in real-time!',
  );
  const [hiddenMessage, setHiddenMessage] = useState('secret message');
  const [encodedResult, setEncodedResult] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'encode' | 'detect'>('encode');
  const [detectedMessage, setDetectedMessage] = useState<string | null>(null);
  const [analyzedText, setAnalyzedText] = useState('');

  // Convert text to binary representation
  const textToBinary = (text: string) => {
    return text.split('').map((char) => {
      const charCode = char.charCodeAt(0);
      return charCode.toString(2).padStart(8, '0');
    });
  };

  // Convert binary to invisible characters
  const binaryToInvisible = (binary: string) => {
    return binary
      .split('')
      .map((bit) => (bit === '0' ? INVISIBLE_CHARS.SEPARATOR : INVISIBLE_CHARS.SPACE))
      .join('');
  };

  // Encode the message in real-time
  useEffect(() => {
    if (!hiddenMessage) {
      setEncodedResult(visibleText);
      return;
    }

    let encoded = INVISIBLE_CHARS.START;
    const binaryArray = textToBinary(hiddenMessage);
    binaryArray.forEach((binary) => {
      encoded += binaryToInvisible(binary);
    });
    encoded += INVISIBLE_CHARS.END;

    setEncodedResult(visibleText + encoded);
  }, [visibleText, hiddenMessage]);

  // Detect and decode hidden messages
  const detectHiddenMessage = (text: string) => {
    const startIndex = text.indexOf(INVISIBLE_CHARS.START);
    const endIndex = text.lastIndexOf(INVISIBLE_CHARS.END);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      return null;
    }

    const encodedPart = text.substring(startIndex + 1, endIndex);
    let binary = '';

    for (let i = 0; i < encodedPart.length; i++) {
      if (encodedPart[i] === INVISIBLE_CHARS.SEPARATOR) {
        binary += '0';
      } else if (encodedPart[i] === INVISIBLE_CHARS.SPACE) {
        binary += '1';
      }
    }

    let message = '';
    for (let i = 0; i < binary.length; i += 8) {
      const byte = binary.substr(i, 8);
      if (byte.length === 8) {
        message += String.fromCharCode(Number.parseInt(byte, 2));
      }
    }

    return message;
  };

  const handleCopy = async () => {
    try {
      // Create a temporary textarea to handle copying with invisible characters
      const tempTextArea = document.createElement('textarea');
      tempTextArea.value = encodedResult;
      document.body.appendChild(tempTextArea);
      tempTextArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempTextArea);

      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (err) {
      setCopyStatus('Failed to copy');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'encode' ? styles.active : ''}`}
          onClick={() => setActiveTab('encode')}
        >
          Encode Message
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'detect' ? styles.active : ''}`}
          onClick={() => setActiveTab('detect')}
        >
          Detect Hidden Messages
        </button>
      </div>

      {activeTab === 'encode' ? (
        <>
          <div className={styles.inputGroup}>
            <div className={styles.inputWrapper}>
              <label className={styles.label}>Visible Text</label>
              <textarea
                className={styles.textarea}
                value={visibleText}
                onChange={(e) => setVisibleText(e.target.value)}
                placeholder="Type your visible text here..."
              />
            </div>
            <div className={styles.inputWrapper}>
              <label className={styles.label}>Hidden Message</label>
              <input
                type="text"
                className={styles.input}
                value={hiddenMessage}
                onChange={(e) => setHiddenMessage(e.target.value)}
                placeholder="Enter your secret message..."
              />
            </div>
          </div>

          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <h3 className={styles.previewTitle}>Live Preview</h3>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={showPreview}
                  onChange={(e) => setShowPreview(e.target.checked)}
                  className={styles.toggle}
                />
                Show Encoding Details
              </label>
            </div>

            {showPreview && hiddenMessage && (
              <div className={styles.encodingPreview}>
                {hiddenMessage.split('').map((char, index) => {
                  const binary = textToBinary(char)[0];
                  return (
                    <div key={index} className={styles.charPreview}>
                      <div className={styles.charDetails}>
                        <span className={styles.char}>{char}</span>
                        <span className={styles.arrow}>→</span>
                        <span className={styles.ascii}>{char.charCodeAt(0)}</span>
                        <span className={styles.arrow}>→</span>
                        <span className={styles.binary}>
                          {binary.split('').map((bit, i) => (
                            <span key={i} className={styles.bit}>
                              {bit}
                            </span>
                          ))}
                        </span>
                        <span className={styles.arrow}>→</span>
                        <span className={styles.invisible}>
                          {binary.split('').map((bit, i) => (
                            <span key={i} className={styles.invisibleChar}>
                              {bit === '0' ? 'ZWNJ' : 'InvSep'}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={styles.result}>
              <div className={styles.resultHeader}>
                <h4 className={styles.resultTitle}>Result</h4>
                <button
                  className={`${styles.copyButton} ${copyStatus ? styles.copied : ''}`}
                  onClick={handleCopy}
                >
                  {copyStatus || 'Copy'}
                </button>
              </div>
              <div className={styles.resultText}>{encodedResult}</div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.detectSection}>
          <div className={styles.inputWrapper}>
            <label className={styles.label}>Paste Text to Analyze</label>
            <textarea
              className={styles.textarea}
              value={analyzedText}
              onChange={(e) => {
                const text = e.target.value;
                setAnalyzedText(text);
                const message = detectHiddenMessage(text);
                setDetectedMessage(message);
              }}
              placeholder="Paste text here to check for hidden messages..."
            />
          </div>
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <h4 className={styles.resultTitle}>Analysis Result</h4>
            </div>
            <div className={styles.resultText}>
              {detectedMessage ? (
                <>
                  <p>Hidden message detected!</p>
                  <div className={styles.detectedMessage}>
                    <strong>Hidden content:</strong> {detectedMessage}
                  </div>
                </>
              ) : analyzedText ? (
                <p>No hidden messages found in this text.</p>
              ) : (
                <p>Paste some text above to analyze it for hidden messages.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnicodePlayground;
