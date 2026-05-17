import { Building2, HeartPulse, Phone, Pill, Shield, ShoppingCart } from 'lucide-react';
import type { Plugin } from '@promptfoo/redteam/constants';

import type { VerticalSuite } from './VerticalSuiteCard';

export const VERTICAL_SUITES: VerticalSuite[] = [
  {
    id: 'ecommerce',
    name: 'E-commerce',
    icon: <ShoppingCart className="size-5" />,
    description:
      'PCI DSS compliance, payment data security, and customer privacy for online retail.',
    longDescription:
      'Comprehensive testing for e-commerce AI systems covering payment security, compliance, and transaction integrity. Tests focus on preventing extraction of credit card numbers, CVVs, bank account details, and payment tokens (PCI DSS compliance), detecting attempts to bypass security rules or terms of service, identifying fraudulent order patterns or unauthorized transactions, and preventing price manipulation through discount abuse or inventory exploits.',
    color: 'primary',
    complianceFrameworks: ['PCI DSS'],
    requiresEnterprise: true,
    plugins: [
      'ecommerce:pci-dss',
      'ecommerce:compliance-bypass',
      'ecommerce:order-fraud',
      'ecommerce:price-manipulation',
    ] as Plugin[],
    pluginGroups: [
      {
        name: 'Payment Data Security',
        plugins: ['ecommerce:pci-dss'] as Plugin[],
      },
      {
        name: 'Security & Compliance',
        plugins: ['ecommerce:compliance-bypass'] as Plugin[],
      },
      {
        name: 'Fraud Prevention',
        plugins: ['ecommerce:order-fraud', 'ecommerce:price-manipulation'] as Plugin[],
      },
    ],
  },
  {
    id: 'financial',
    name: 'Financial Services',
    icon: <Building2 className="size-5" />,
    description:
      'Trading systems, risk assessment, credit scoring, and customer advisory platforms',
    longDescription:
      'Comprehensive testing for financial services AI including trading systems, robo-advisors, risk assessment, credit scoring, and customer service. Tests cover calculation errors in option pricing and risk models, compliance violations (insider trading, market manipulation), confidential data disclosure (MNPI, proprietary strategies), hallucination of market data, counterfactual narratives, defamation of financial entities, inappropriate financial advice, and Japan FIEA suitability failures such as recommending risky products to customers who are not suitable for them.',
    color: 'primary',
    complianceFrameworks: ['SEC', 'FINRA', 'SOX', 'Japan FIEA'],
    requiresEnterprise: true,
    plugins: [
      'financial:calculation-error',
      'financial:compliance-violation',
      'financial:confidential-disclosure',
      'financial:counterfactual',
      'financial:data-leakage',
      'financial:defamation',
      'financial:hallucination',
      'financial:impartiality',
      'financial:japan-fiea-suitability',
      'financial:misconduct',
      'financial:sycophancy',
    ] as Plugin[],
    pluginGroups: [
      {
        name: 'Data Protection & Confidentiality',
        plugins: ['financial:confidential-disclosure', 'financial:data-leakage'] as Plugin[],
      },
      {
        name: 'Accuracy & Integrity',
        plugins: [
          'financial:calculation-error',
          'financial:hallucination',
          'financial:counterfactual',
        ] as Plugin[],
      },
      {
        name: 'Compliance & Ethics',
        plugins: [
          'financial:compliance-violation',
          'financial:misconduct',
          'financial:impartiality',
          'financial:japan-fiea-suitability',
        ] as Plugin[],
      },
      {
        name: 'Reputation & Decision Quality',
        plugins: ['financial:defamation', 'financial:sycophancy'] as Plugin[],
      },
    ],
  },
  {
    id: 'medical',
    name: 'Healthcare',
    icon: <HeartPulse className="size-5" />,
    description: 'Clinical decision support, diagnosis assistance, and patient triage systems',
    longDescription:
      'Specialized tests for medical AI systems including clinical decision support, diagnosis assistance, treatment recommendations, patient triage, and connected medical-device workflows. Tests cover hallucination of medical facts, clinical accuracy, anchoring bias, prioritization errors, off-label medication suggestions, sycophantic behavior, FDA cybersecurity access-control and audit-log tampering attempts, and FDA AI transparency or intended-use disclosure failures.',
    color: 'primary', // Use theme primary color
    complianceFrameworks: [
      'Patient Privacy',
      'FDA 21 CFR Part 11',
      'FDA Medical Device Cybersecurity Guidance',
      'FDA AI-Enabled Device Guidance',
    ],
    requiresEnterprise: true,
    plugins: [
      'medical:hallucination',
      'medical:incorrect-knowledge',
      'medical:prioritization-error',
      'medical:off-label-use',
      'medical:anchoring-bias',
      'medical:sycophancy',
      'medical:fda:cyber-access-control',
      'medical:fda:cyber-audit-tampering',
      'medical:fda:ai-disclosure',
    ] as Plugin[],
    pluginGroups: [
      {
        name: 'Clinical Accuracy & Safety',
        plugins: [
          'medical:hallucination',
          'medical:incorrect-knowledge',
          'medical:prioritization-error',
        ] as Plugin[],
      },
      {
        name: 'Treatment Recommendations',
        plugins: ['medical:off-label-use', 'medical:anchoring-bias'] as Plugin[],
      },
      {
        name: 'Decision Quality',
        plugins: ['medical:sycophancy'] as Plugin[],
      },
      {
        name: 'FDA Cybersecurity Controls',
        plugins: [
          'medical:fda:cyber-access-control',
          'medical:fda:cyber-audit-tampering',
        ] as Plugin[],
      },
      {
        name: 'FDA AI Lifecycle Disclosure',
        plugins: ['medical:fda:ai-disclosure'] as Plugin[],
      },
    ],
  },
  {
    id: 'insurance',
    name: 'Insurance Safety',
    icon: <Shield className="size-5" />,
    description: 'Coverage decisions, network accuracy, and policyholder data protection',
    longDescription:
      'Specialized tests for insurance AI systems across health, property, auto, life, and commercial lines. Tests cover discriminatory coverage decisions based on protected characteristics (ADA, Section 1557, GINA violations), inaccurate provider or vendor network information that could cause surprise bills or denied service, and unauthorized disclosure of policyholder data or PHI in violation of GLBA, FCRA, DPPA, and patient data privacy requirements.',
    color: 'primary',
    complianceFrameworks: [
      'Patient Privacy',
      'GLBA',
      'FCRA',
      'DPPA',
      'ADA',
      'Section 1557',
      'Fair Housing Act',
      'ECOA',
    ],
    requiresEnterprise: true,
    plugins: [
      'insurance:coverage-discrimination',
      'insurance:data-disclosure',
      'insurance:network-misinformation',
      'insurance:phi-disclosure',
    ] as Plugin[],
    pluginGroups: [
      {
        name: 'Coverage Equity & Compliance',
        plugins: ['insurance:coverage-discrimination'] as Plugin[],
      },
      {
        name: 'Network Accuracy',
        plugins: ['insurance:network-misinformation'] as Plugin[],
      },
      {
        name: 'Privacy & Data Protection',
        plugins: ['insurance:data-disclosure', 'insurance:phi-disclosure'] as Plugin[],
      },
    ],
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    icon: <Pill className="size-5" />,
    description: 'Medication dispensing, drug interactions, and dosage calculations',
    longDescription:
      'Critical safety testing for pharmacy AI systems including medication dispensing, drug interaction checking, dosage calculations, and controlled substance monitoring. Tests cover dangerous drug-drug/drug-food/drug-supplement interactions, dosage calculation errors (weight-based, renal adjustments, pediatric dosing), and DEA controlled substance compliance (schedule restrictions, early refill detection, PDMP requirements).',
    color: 'primary',
    complianceFrameworks: ['DEA', 'FDA', '21 CFR Part 1300'],
    requiresEnterprise: true,
    plugins: [
      'pharmacy:drug-interaction',
      'pharmacy:dosage-calculation',
      'pharmacy:controlled-substance-compliance',
    ] as Plugin[],
    pluginGroups: [
      {
        name: 'Patient Safety',
        plugins: ['pharmacy:drug-interaction', 'pharmacy:dosage-calculation'] as Plugin[],
      },
      {
        name: 'Regulatory Compliance',
        plugins: ['pharmacy:controlled-substance-compliance'] as Plugin[],
      },
    ],
  },
  {
    id: 'telecom',
    name: 'Telecommunications',
    icon: <Phone className="size-5" />,
    description: 'CPNI protection, account security, and regulatory compliance for telecom AI',
    longDescription:
      "Comprehensive testing for telecommunications AI systems including customer service chatbots, account management, and support applications. Tests cover CPNI disclosure (FCC 47 U.S.C. Section 222), location data protection, SIM swap and account takeover prevention, E911 compliance (Kari's Law, RAY BAUM's Act), TCPA consent and Do Not Call compliance, slamming/cramming prevention, fraud enablement, number portability accuracy, billing accuracy, coverage claims, law enforcement request handling (CALEA), and accessibility requirements (Section 255, CVAA).",
    color: 'primary',
    complianceFrameworks: ['FCC CPNI', 'TCPA', 'E911', 'CALEA', 'Section 255'],
    requiresEnterprise: true,
    plugins: [
      'telecom:cpni-disclosure',
      'telecom:location-disclosure',
      'telecom:account-takeover',
      'telecom:e911-misinformation',
      'telecom:tcpa-violation',
      'telecom:unauthorized-changes',
      'telecom:fraud-enablement',
      'telecom:porting-misinformation',
      'telecom:billing-misinformation',
      'telecom:coverage-misinformation',
      'telecom:law-enforcement-request-handling',
      'telecom:accessibility-violation',
    ] as Plugin[],
    pluginGroups: [
      {
        name: 'Customer Data Protection',
        plugins: ['telecom:cpni-disclosure', 'telecom:location-disclosure'] as Plugin[],
      },
      {
        name: 'Account Security',
        plugins: ['telecom:account-takeover', 'telecom:fraud-enablement'] as Plugin[],
      },
      {
        name: 'Regulatory Compliance',
        plugins: [
          'telecom:tcpa-violation',
          'telecom:unauthorized-changes',
          'telecom:e911-misinformation',
          'telecom:law-enforcement-request-handling',
          'telecom:accessibility-violation',
        ] as Plugin[],
      },
      {
        name: 'Service Accuracy',
        plugins: [
          'telecom:porting-misinformation',
          'telecom:billing-misinformation',
          'telecom:coverage-misinformation',
        ] as Plugin[],
      },
    ],
  },
];

// Helper to get all domain-specific plugins
export const DOMAIN_SPECIFIC_PLUGINS = VERTICAL_SUITES.flatMap((suite) => suite.plugins);

// Helper to find which suite a plugin belongs to
export function getPluginSuite(plugin: Plugin): VerticalSuite | undefined {
  return VERTICAL_SUITES.find((suite) => suite.plugins.includes(plugin));
}
