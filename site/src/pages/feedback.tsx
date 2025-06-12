import React, { useState } from 'react';
import Layout from '@theme/Layout';
import styles from './feedback.module.css';

interface FeedbackFormData {
  name: string;
  email: string;
  company: string;
  feedbackType: string;
  message: string;
  usageContext: string[];
  other: string;
}

const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScAnqlqX-ep-aOn6umjXXDVafc1sLTOEd5W6rMAPKllLk0CIA/formResponse';

// Google Form field mappings (you'll need to inspect your form to get these)
const FORM_FIELDS = {
  name: 'entry.1234567890', // Replace with actual field names from your Google Form
  email: 'entry.0987654321',
  company: 'entry.1122334455',
  feedbackType: 'entry.5566778899',
  message: 'entry.9988776655',
  usageContext: 'entry.4433221100',
  other: 'entry.7766554433',
};

export default function Feedback() {
  const [activeTab, setActiveTab] = useState('quick');
  const [formData, setFormData] = useState<FeedbackFormData>({
    name: '',
    email: '',
    company: '',
    feedbackType: '',
    message: '',
    usageContext: [],
    other: '',
  });
  const [selectedQuickFeedback, setSelectedQuickFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (value: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      usageContext: checked
        ? [...prev.usageContext, value]
        : prev.usageContext.filter((item) => item !== value),
    }));
  };

  const submitToGoogleForms = async (data: Record<string, string>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    try {
      // Submit to Google Forms
      await fetch(GOOGLE_FORM_URL, {
        method: 'POST',
        mode: 'no-cors', // Required for Google Forms
        body: formData,
      });
      return true;
    } catch (error) {
      console.error('Error submitting to Google Forms:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Prepare data for Google Forms
    const submissionData = {
      [FORM_FIELDS.name]: formData.name,
      [FORM_FIELDS.email]: formData.email,
      [FORM_FIELDS.company]: formData.company,
      [FORM_FIELDS.feedbackType]: formData.feedbackType,
      [FORM_FIELDS.message]: formData.message,
      [FORM_FIELDS.usageContext]: formData.usageContext.join(', '),
      [FORM_FIELDS.other]: formData.other,
    };

    const success = await submitToGoogleForms(submissionData);

    setIsSubmitting(false);
    if (success) {
      setShowSuccess(true);
      // Reset form
      setFormData({
        name: '',
        email: '',
        company: '',
        feedbackType: '',
        message: '',
        usageContext: [],
        other: '',
      });
    }
  };

  const handleQuickFeedbackSubmit = async (feedbackType: string, message: string) => {
    setIsSubmitting(true);

    const submissionData = {
      [FORM_FIELDS.feedbackType]: feedbackType,
      [FORM_FIELDS.message]: message,
      [FORM_FIELDS.name]: 'Quick Feedback',
      [FORM_FIELDS.email]: '',
      [FORM_FIELDS.company]: '',
      [FORM_FIELDS.usageContext]: '',
      [FORM_FIELDS.other]: '',
    };

    const success = await submitToGoogleForms(submissionData);

    setIsSubmitting(false);
    if (success) {
      setShowSuccess(true);
      setSelectedQuickFeedback('');
    }
  };

  const quickFeedbackOptions = [
    {
      id: 'love',
      emoji: '❤️',
      title: 'Love it!',
      description: 'Promptfoo is working great for me',
      message: "I love using promptfoo! It's working great for my use case.",
    },
    {
      id: 'suggestion',
      emoji: '💡',
      title: 'Suggestion',
      description: 'I have an idea to make it better',
      message: 'I have a suggestion to improve promptfoo: ',
    },
    {
      id: 'issue',
      emoji: '🐛',
      title: 'Found an issue',
      description: "Something isn't working as expected",
      message: 'I found an issue with promptfoo: ',
    },
    {
      id: 'question',
      emoji: '❓',
      title: 'Question',
      description: 'I need help with something',
      message: 'I have a question about promptfoo: ',
    },
  ];

  const usageOptions = [
    'Testing RAG or chains',
    'Testing standalone prompts',
    'Deciding whether to use a new model',
    'Collaborating with a larger team of developers',
    'Using it in CI/CD',
    'Red teaming and security testing',
    'Model comparison and evaluation',
  ];

  if (showSuccess) {
    return (
      <Layout title="Feedback" description="Thank you for your feedback!">
        <main className={styles.feedbackContainer}>
          <div className={styles.successMessage}>
            <h1 className={styles.successTitle}>Thank You! 🎉</h1>
            <p className={styles.successText}>
              Your feedback has been received and helps us make promptfoo better for everyone. We
              read every submission and use your insights to guide our development priorities.
            </p>
            <button
              className={styles.submitButton}
              onClick={() => setShowSuccess(false)}
              style={{ marginTop: '1rem' }}
            >
              Submit More Feedback
            </button>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      title="Feedback"
      description="Help us improve promptfoo - Share your thoughts, suggestions, and feedback with our team"
    >
      <main className={styles.feedbackContainer}>
        <div className={styles.hero}>
          <h1 className={styles.title}>We Value Your Feedback</h1>
          <p className={styles.subtitle}>
            Your insights drive our development and help us build the AI testing tools you need.
            Every piece of feedback helps us improve promptfoo for the entire community.
          </p>
        </div>

        <div className={styles.feedbackTabs}>
          <button
            className={`${styles.feedbackTab} ${activeTab === 'quick' ? styles.active : ''}`}
            onClick={() => setActiveTab('quick')}
          >
            Quick Feedback
          </button>
          <button
            className={`${styles.feedbackTab} ${activeTab === 'detailed' ? styles.active : ''}`}
            onClick={() => setActiveTab('detailed')}
          >
            Detailed Feedback
          </button>
          <button
            className={`${styles.feedbackTab} ${activeTab === 'feature' ? styles.active : ''}`}
            onClick={() => setActiveTab('feature')}
          >
            Feature Request
          </button>
          <button
            className={`${styles.feedbackTab} ${activeTab === 'bug' ? styles.active : ''}`}
            onClick={() => setActiveTab('bug')}
          >
            Bug Report
          </button>
        </div>

        <div className={styles.tabContent}>
          {/* Quick Feedback Tab */}
          <div className={`${styles.tabPanel} ${activeTab === 'quick' ? '' : styles.hidden}`}>
            <h2 className={styles.sectionTitle}>Quick Feedback</h2>
            <p className={styles.sectionDescription}>
              Share your thoughts in just one click! This helps us understand how promptfoo is
              working for you.
            </p>

            <div className={styles.quickFeedback}>
              {quickFeedbackOptions.map((option) => (
                <div
                  key={option.id}
                  className={`${styles.quickFeedbackCard} ${selectedQuickFeedback === option.id ? styles.selected : ''}`}
                  onClick={() => {
                    setSelectedQuickFeedback(option.id);
                    handleQuickFeedbackSubmit(option.title, option.message);
                  }}
                >
                  <span className={styles.quickFeedbackEmoji}>{option.emoji}</span>
                  <h3 className={styles.quickFeedbackTitle}>{option.title}</h3>
                  <p className={styles.quickFeedbackDesc}>{option.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Feedback Tab */}
          <div className={`${styles.tabPanel} ${activeTab === 'detailed' ? '' : styles.hidden}`}>
            <h2 className={styles.sectionTitle}>Detailed Feedback</h2>
            <p className={styles.sectionDescription}>
              Tell us more about your experience with promptfoo. We'd love to hear your thoughts,
              suggestions, or any challenges you've faced.
            </p>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder="Your name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email (optional)</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder="your.email@company.com"
                />
                <small style={{ color: 'var(--ifm-color-emphasis-700)', fontSize: '0.9rem' }}>
                  If you'd like us to follow up on your feedback
                </small>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>How are you using promptfoo? (optional)</label>
                <div className={styles.checkboxGroup}>
                  {usageOptions.map((option) => (
                    <div key={option} className={styles.checkboxItem}>
                      <input
                        type="checkbox"
                        id={option}
                        className={styles.checkbox}
                        checked={formData.usageContext.includes(option)}
                        onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                      />
                      <label htmlFor={option} className={styles.checkboxLabel}>
                        {option}
                      </label>
                    </div>
                  ))}
                  <div className={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      id="other"
                      className={styles.checkbox}
                      checked={formData.usageContext.includes('Other')}
                      onChange={(e) => handleCheckboxChange('Other', e.target.checked)}
                    />
                    <label htmlFor="other" className={styles.checkboxLabel}>
                      Other:
                    </label>
                  </div>
                  {formData.usageContext.includes('Other') && (
                    <input
                      type="text"
                      name="other"
                      value={formData.other}
                      onChange={handleInputChange}
                      className={`${styles.input} ${styles.otherInput}`}
                      placeholder="Please specify..."
                    />
                  )}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={`${styles.label} ${styles.required}`}>Your feedback</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  className={styles.textarea}
                  placeholder="What would you like to tell us about your experience with promptfoo?"
                  required
                />
              </div>

              <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Feedback'}
              </button>
            </form>
          </div>

          {/* Feature Request Tab */}
          <div className={`${styles.tabPanel} ${activeTab === 'feature' ? '' : styles.hidden}`}>
            <h2 className={styles.sectionTitle}>Feature Request</h2>
            <p className={styles.sectionDescription}>
              Have an idea for a new feature? We'd love to hear it! Describe what you'd like to see
              in promptfoo.
            </p>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder="Your name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email (optional)</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder="your.email@company.com"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={`${styles.label} ${styles.required}`}>Feature Description</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  className={styles.textarea}
                  placeholder="Describe the feature you'd like to see. What problem would it solve? How would it work?"
                  required
                  style={{ minHeight: '150px' }}
                />
              </div>

              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting}
                onClick={() =>
                  setFormData((prev) => ({ ...prev, feedbackType: 'Feature Request' }))
                }
              >
                {isSubmitting ? 'Sending...' : 'Submit Feature Request'}
              </button>
            </form>
          </div>

          {/* Bug Report Tab */}
          <div className={`${styles.tabPanel} ${activeTab === 'bug' ? '' : styles.hidden}`}>
            <h2 className={styles.sectionTitle}>Bug Report</h2>
            <p className={styles.sectionDescription}>
              Found something that's not working as expected? Help us fix it by providing details
              about the issue.
            </p>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder="Your name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email (optional)</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder="your.email@company.com"
                />
                <small style={{ color: 'var(--ifm-color-emphasis-700)', fontSize: '0.9rem' }}>
                  We may need to follow up for more details
                </small>
              </div>

              <div className={styles.formGroup}>
                <label className={`${styles.label} ${styles.required}`}>Bug Description</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  className={styles.textarea}
                  placeholder="Please describe:&#10;1. What you were trying to do&#10;2. What you expected to happen&#10;3. What actually happened&#10;4. Steps to reproduce (if possible)&#10;5. Any error messages"
                  required
                  style={{ minHeight: '200px' }}
                />
              </div>

              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting}
                onClick={() => setFormData((prev) => ({ ...prev, feedbackType: 'Bug Report' }))}
              >
                {isSubmitting ? 'Sending...' : 'Submit Bug Report'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </Layout>
  );
}
