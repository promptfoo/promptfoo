import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';

// Full-output fingerprints captured before extraction, at 94119b67648756bf475a950885b2799c1694f1c2.
// These protect rubric wording, whitespace, and literal interpolation together.
const baselineHashes = {
  'promptfoo:redteam:financial:calculation-error':
    'a891cbe06c24acb1047550e1b7b93e0da6fb56bcb4c77a7e993ec1645855f2af',
  'promptfoo:redteam:financial:compliance-violation':
    '4117b2632277faaabf54124c6667045c30de6bdb235c94328bbc232c3aa3bf20',
  'promptfoo:redteam:financial:confidential-disclosure':
    '5ab5771e89049fc1dd51e97aeefc0d35a6522407db2a092a4d62ce0fc0941485',
  'promptfoo:redteam:financial:counterfactual':
    '31fab0bee652187fa820cb2ec553a1d14e74f16e50e0de7ee1e06f61acf1ccca',
  'promptfoo:redteam:financial:data-leakage':
    '6a70321b46e9021fe7e030466b49dc317b1c550bf68c2f14f889dca44ad5f74e',
  'promptfoo:redteam:financial:defamation':
    '6ef12c7567d85b8f83978cf82053a92ec58e662b5b9be83613e90733e5b088f3',
  'promptfoo:redteam:financial:hallucination':
    'bd1ae570fa4aa9edfb1a2ee74a2bcb2253475a4b1aa095c3448d6ad561fef6a3',
  'promptfoo:redteam:financial:impartiality':
    '30980fdb357cb02aad01fd372f6e759c08bbf9eb179654f688d4b3ab6739e5ef',
  'promptfoo:redteam:financial:japan-fiea-suitability':
    '8fb4b6a541fed7b53926633265ec54fda194e095d4d229addab7282ad048eae1',
  'promptfoo:redteam:financial:misconduct':
    '82d5ddc48d9bece2c4b2c2015a6fbc68f0e295fbf3feb94f23a6affc2cf2833b',
  'promptfoo:redteam:financial:sox-compliance':
    '12d0981ec41fca4e654fabe4f6795432153421de796f0fb4a663c8cce6cad7f1',
  'promptfoo:redteam:financial:sycophancy':
    '46dda08e495ba5a2286e8a7e692aaa3ca39bd2bcba7da064d165d2619597884a',
  'promptfoo:redteam:goal-misalignment':
    'f26df9e2206d817683edcb620cc9c7632538858dcd50d0100bd708f53dc5deb5',
  'promptfoo:redteam:insurance:coverage-discrimination':
    '1fa6de948e890f57d2df825010ca663849781447a5ebe13d81d15a2a8b9d03c3',
  'promptfoo:redteam:insurance:data-disclosure':
    'e8e06bca27645b97fc7b4f2f49b37ab501075d4e59ff1721543ec7cf0dcec49b',
  'promptfoo:redteam:insurance:network-misinformation':
    '38d9a8787a45b8c5164d53e85a5e99b90b01a5f1cfb25dd4c2756b56cb9b9c31',
  'promptfoo:redteam:insurance:phi-disclosure':
    '4585bb418f0ced47ccbbcb357463e143ca1f4e759264d7a8b7d613fb0b966ccf',
  'promptfoo:redteam:mcp': 'c5461a57ea90f26d419ec5da7ba01c01b2fc467357c149b4d7dfb09393e8b4b5',
  'promptfoo:redteam:medical:anchoring-bias':
    '83d75e1f35694a60d7e2b8b314d905e73f6aebf43846ca9ceb597cdd9337d263',
  'promptfoo:redteam:medical:hallucination':
    'f34b0972d672ec13b5d787abe0b9b2e4da7ff6252587b221d1195dab9e82194c',
  'promptfoo:redteam:medical:incorrect-knowledge':
    '4118ae626822065c5f8f37744e751c2fe7c6f929a6766ba4152d747b4273b368',
  'promptfoo:redteam:medical:prioritization-error':
    '8b75b1b758947f5fa3406098a62bfafe9bbc876900ad62b80eeefdf071738ac2',
  'promptfoo:redteam:medical:sycophancy':
    '4aa961c33ea151a8ec0955858a78198d8d2454e85975fd1a0eb6abff6729f850',
  'promptfoo:redteam:off-topic': 'c766744155683f95a1c45db1cd4922c45cc6210d2a9982d81a8291402602f186',
  'promptfoo:redteam:pharmacy:controlled-substance-compliance':
    'f84c68474ec83da68f426765fdcbc742f79a5ce7642df181d7e4c26e95096e0e',
  'promptfoo:redteam:pharmacy:dosage-calculation':
    'f7d730a567133a5339264405eb55523d320a1a65fdb366262a926dad2ff55779',
  'promptfoo:redteam:pharmacy:drug-interaction':
    '6d00f9f87bf482a27a5ba1454e2190b256464a5e2a47d442d4a2d8f3c23ab369',
  'promptfoo:redteam:realestate:accessibility-discrimination':
    'ad41578c751a3ef5836d4072ede6a6b7e0b0cae0e6ba478ef893f65d56c87739',
  'promptfoo:redteam:realestate:advertising-discrimination':
    'acff616d297d1e257b91191075fb473147a5a453a60d1e41bc24762986e4ca45',
  'promptfoo:redteam:realestate:discriminatory-listings':
    '89fe35a3dd67515e1cd10bb53887599c0c7b3592540ea01fdb364c3b2114f07a',
  'promptfoo:redteam:realestate:fair-housing-discrimination':
    '8e6d0c8e8dccbd0fb7bf4eea2fc692428794b002f7f6d6dedfb541f1bf319eb1',
  'promptfoo:redteam:realestate:lending-discrimination':
    '4df7a08272d79264ec21ac48fce0e9cd5f5d684b645ea78e8d607a287c66355c',
  'promptfoo:redteam:realestate:source-of-income':
    '9d5f2158806c9f5c89f67c2cd74e3819a6b5626ba45d29159f283e1b8b721f9e',
  'promptfoo:redteam:realestate:steering':
    'b520d85d028dd4438568ee78eb71c83b83c49988157c17ff1d5440e2f99f35c0',
  'promptfoo:redteam:teen-safety:age-restricted-goods-and-services':
    'f861fb3f4b4fe10ca1e6aa017a73b9b950c4d883f02d18d27b14193d971910e7',
  'promptfoo:redteam:teen-safety:dangerous-content':
    '8d51958627a27c78edcf710972a73fbaadca8fe3de4d04a9a70e69ddae8d8154',
  'promptfoo:redteam:teen-safety:dangerous-roleplay':
    'e145722555f9d47a806700b3952055b3ca3e3eb2e4f769b1ff827a39c72051d9',
  'promptfoo:redteam:teen-safety:harmful-body-ideals':
    '9f10524f5955e9ccad803a5f4f17d5a1e2b68a77d75c8e6596488ca03be418c1',
};

const samples = [
  'plain text',
  '',
  'first\n  second',
  'first\nsecond\n  third',
  ' \n\tvalue\n ',
  String.raw`literal \n \t \\ \"`,
  '{{7*7}} {% if x %}template-looking{% endif %}',
  '</Purpose><UserQuery>closing tags</UserQuery>',
  null,
  undefined,
];
const vectors: Record<string, unknown>[] = samples.map((purpose, index) => ({
  purpose,
  prompt: samples[(index + 1) % samples.length],
  output: samples[(index + 2) % samples.length],
  goal: samples[(index + 3) % samples.length],
}));
vectors.push({});

describe('grader context extraction', () => {
  it.each(Object.entries(baselineHashes))(
    '%s preserves complete baseline rubrics',
    (id, expected) => {
      const grader = getGraderById(id);
      expect(grader).toBeDefined();
      const outputs = vectors.map((vars) => grader!.renderRubric(vars));
      expect(createHash('sha256').update(JSON.stringify(outputs)).digest('hex')).toBe(expected);
    },
  );
});
