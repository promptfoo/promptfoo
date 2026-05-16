import React, { useEffect, useId, useRef, useState } from 'react';

import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export interface NavMenuCardItem {
  to?: string;
  href?: string;
  label: string;
  description?: string;
  icon?: string;
  type?: 'section-header' | 'link';
  sectionTitle?: string;
}

interface NavMenuCardProps {
  label: string;
  items: NavMenuCardItem[];
  position?: 'left' | 'right';
}

export default function NavMenuCard({
  label,
  items,
  position = 'left',
}: NavMenuCardProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const handleToggle = () => {
    if (canHover()) {
      setIsOpen(true);
      return;
    }

    setIsOpen(!isOpen);
  };
  // Group items by section
  const sections: { title?: string; items: NavMenuCardItem[] }[] = [];
  let currentSection: { title?: string; items: NavMenuCardItem[] } = { items: [] };

  items.forEach((item) => {
    if (item.type === 'section-header') {
      if (currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: item.label, items: [] };
    } else if (!item.type?.startsWith('html')) {
      currentSection.items.push(item);
    }
  });

  // Push the last section if it has items
  if (currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  // If no sections were created, put all items in a single section
  const displaySections =
    sections.length > 0
      ? sections
      : [
          {
            items: items.filter(
              (item) => !item.type?.startsWith('html') && item.type !== 'section-header',
            ),
          },
        ];

  return (
    <div
      className={styles.navMenuCard}
      ref={menuRef}
      onMouseEnter={() => {
        if (canHover()) {
          setIsOpen(true);
        }
      }}
      onMouseLeave={() => {
        if (canHover()) {
          setIsOpen(false);
        }
      }}
      onBlurCapture={(event) => {
        if (!menuRef.current?.contains(event.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`${styles.navMenuCardButton} ${isOpen ? styles.navMenuCardButtonOpen : ''} navbar__link`}
        onClick={handleToggle}
        aria-controls={dropdownId}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label}
        <svg
          className={styles.navMenuCardIcon}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        id={dropdownId}
        className={`${styles.navMenuCardDropdown} ${isOpen ? styles.navMenuCardDropdownOpen : ''}`}
      >
        <div className={styles.navMenuCardContainer}>
          {displaySections.map((section, sectionIndex) => (
            <div key={sectionIndex} className={styles.navMenuCardSection}>
              {section.title && (
                <div className={styles.navMenuCardSectionTitle}>{section.title}</div>
              )}
              <div className={styles.navMenuCardGrid}>
                {section.items.map((item, itemIndex) => {
                  const isExternal =
                    item.href &&
                    (item.href.startsWith('http://') || item.href.startsWith('https://'));
                  const linkProps = {
                    to: item.to,
                    href: item.href,
                    className: styles.navMenuCardItem,
                    ...(isExternal && { target: '_blank', rel: 'noopener noreferrer' }),
                  };

                  return (
                    <Link key={itemIndex} {...linkProps}>
                      <div className={styles.navMenuCardItemTitle}>{item.label}</div>
                      {item.description && (
                        <div className={styles.navMenuCardItemDescription}>{item.description}</div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
