import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Create a test dataset',
    Svg: require('@site/static/img/svgrepo_science2.svg').default,
    description: (
      <>Use a representative sample of user inputs to reduce subjectivity when tuning prompts.</>
    ),
  },
  {
    title: 'Set up evaluation metrics',
    Svg: require('@site/static/img/svgrepo_science.svg').default,
    description: <>Use built-in metrics, LLM-graded evals, or define your own custom metrics.</>,
  },
  {
    title: 'Select the best prompt & model',
    Svg: require('@site/static/img/svgrepo_electricity.svg').default,
    description: (
      <>
        Compare prompts and model outputs side-by-side, or integrate the library into your existing
        test/CI workflow.
      </>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
