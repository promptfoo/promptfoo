import React, { useState } from 'react';
import styles from '../styles/TextScanner.module.css';

interface UnicodeChar {
  char: string;
  code: number;
  description: string;
  position: number;
}

const TextScanner: React.FC = () => {
  const [text, setText] = useState('');
  const [findings, setFindings] = useState<UnicodeChar[]>([]);
  const [decodedMessage, setDecodedMessage] = useState<string | null>(null);

  const getCharDescription = (code: number): string => {
    if (code === 0x200b) {
      return 'Zero Width Space';
    }
    if (code === 0x200c) {
      return 'Zero Width Non-Joiner';
    }
    if (code === 0x200d) {
      return 'Zero Width Joiner';
    }
    if (code === 0x2063) {
      return 'Invisible Separator';
    }
    if (code === 0xfeff) {
      return 'Zero Width No-Break Space';
    }
    if (code >= 0xe0000 && code <= 0xe007f) {
      return 'Unicode Tag Character';
    }
    return 'Unknown Invisible Character';
  };

  const decodeHiddenMessage = (chars: UnicodeChar[]): string | null => {
    // Find sequence starting with ZWSP (0x200B) and ending with ZWJ (0x200D)
    let message = '';
    let currentByte = '';
    let isCollecting = false;

    for (const char of chars) {
      if (char.code === 0x200b) {
        // Start marker
        isCollecting = true;
        continue;
      }

      if (char.code === 0x200d) {
        // End marker
        if (currentByte.length > 0) {
          message += String.fromCharCode(Number.parseInt(currentByte, 2));
        }
        break;
      }

      if (isCollecting) {
        if (char.code === 0x200c) {
          // Binary 0
          currentByte += '0';
        } else if (char.code === 0x2063) {
          // Binary 1
          currentByte += '1';
        }

        if (currentByte.length === 8) {
          message += String.fromCharCode(Number.parseInt(currentByte, 2));
          currentByte = '';
        }
      }
    }

    return message || null;
  };

  const scanText = (input: string) => {
    const chars: UnicodeChar[] = [];
    Array.from(input).forEach((char, index) => {
      const code = char.codePointAt(0);
      if (!code) {
        return;
      }

      // Check for invisible characters
      if (
        (code >= 0x200b && code <= 0x200d) || // Zero-width spaces
        code === 0x2063 || // Invisible separator
        code === 0xfeff || // Zero-width no-break space
        (code >= 0xe0000 && code <= 0xe007f) // Tags
      ) {
        chars.push({
          char,
          code,
          description: getCharDescription(code),
          position: index,
        });
      }
    });
    setFindings(chars);
    setDecodedMessage(decodeHiddenMessage(chars));
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    scanText(newText);
  };

  const getHighlightedText = () => {
    if (findings.length === 0 || !text) {
      return text;
    }

    let result = '';
    let lastIndex = 0;

    findings.forEach((finding) => {
      result += text.slice(lastIndex, finding.position);
      result += `<mark class="${styles.highlight}" title="${finding.description} (U+${finding.code.toString(16).toUpperCase()})">⚠️</mark>`;
      lastIndex = finding.position + 1;
    });

    result += text.slice(lastIndex);
    return result;
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputSection}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={handleTextChange}
          placeholder="Paste your text here to scan for hidden Unicode characters..."
          rows={5}
        />
      </div>

      <div className={styles.resultsSection}>
        {text && (
          <div className={styles.resultsTitle}>
            Scan Results
            {findings.length > 0 && (
              <span className={styles.resultsCount}>{findings.length} hidden characters</span>
            )}
          </div>
        )}

        {text && findings.length > 0 && decodedMessage && (
          <div className={styles.decodedMessage}>Decoded hidden message: {decodedMessage}</div>
        )}

        {text &&
          (findings.length > 0 ? (
            <>
              <div
                className={styles.preview}
                dangerouslySetInnerHTML={{ __html: getHighlightedText() }}
              />
              <div className={styles.findings}>
                {findings.map((finding, index) => (
                  <div key={index} className={styles.findingItem}>
                    <span className={styles.findingIcon}>⚠️</span>
                    <div className={styles.findingDetails}>
                      <span className={styles.findingTitle}>{finding.description}</span>
                      <span className={styles.findingCode}>
                        U+{finding.code.toString(16).toUpperCase()}
                      </span>
                      <span className={styles.findingPosition}>at position {finding.position}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.noFindings}>
              ✨ No hidden characters found. Your text appears to be clean.
            </div>
          ))}

        {!text && (
          <div className={styles.noFindings}>
            Enter or paste some text above to scan for hidden Unicode characters.
          </div>
        )}
      </div>
    </div>
  );
};

export default TextScanner;
