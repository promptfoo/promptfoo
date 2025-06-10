import React from 'react';
import styles from '../styles.module.css';

const testimonials = [
  {
    quote:
      "Promptfoo has significantly improved our LLM security posture. It's an essential tool for any enterprise working with AI.",
    author: 'Jane Doe, CTO at TechCorp',
  },
  {
    quote:
      'The comprehensive scanning and continuous monitoring features have saved us countless hours and potential security breaches.',
    author: 'John Smith, Head of AI Security at InnovateCo',
  },
];

export default function Testimonials(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>What Our Customers Say</h2>
        <div className={styles.testimonialGrid}>
          {testimonials.map((testimonial, index) => (
            <div key={index} className={styles.testimonialItem}>
              <blockquote>{testimonial.quote}</blockquote>
              <p className={styles.testimonialAuthor}>{testimonial.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
