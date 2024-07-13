import {
  extractVariablesFromTemplate,
  extractVariablesFromTemplates,
} from '../../src/redteam/injectVar';

describe('extractVariablesFromTemplate', () => {
  it('should extract simple variables', () => {
    const template = 'Hello {{ name }}, welcome to {{ place }}!';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'place']);
  });

  it('should extract variables without spaces', () => {
    const template = 'Hello {{name}}, welcome to {{place}}!';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'place']);
  });

  it('should extract variables with dot notation', () => {
    const template = 'Hello {{ user.name }}, your score is {{ game.score }}!';
    expect(extractVariablesFromTemplate(template)).toEqual(['user.name', 'game.score']);
  });

  it('should extract variables with underscores', () => {
    const template = 'Your order {{ order_id }} will arrive on {{ delivery_date }}.';
    expect(extractVariablesFromTemplate(template)).toEqual(['order_id', 'delivery_date']);
  });

  it('should extract variables with numbers', () => {
    const template = 'Player1: {{ player1 }}, Player2: {{ player2 }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['player1', 'player2']);
  });

  it('should extract variables used in filters', () => {
    const template = '{{ name | capitalize }} - {{ date | date("yyyy-MM-dd") }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'date']);
  });

  it('should extract variables used in complex expressions', () => {
    const template = '{% if user.age > 18 %}Welcome, {{ user.name }}!{% endif %}';
    expect(extractVariablesFromTemplate(template)).toEqual(['user.age', 'user.name']);
  });

  it('should extract variables from for loops', () => {
    const template = '{% for item in items %}{{ item.name }}{% endfor %}';
    expect(extractVariablesFromTemplate(template)).toEqual(['item.name', 'items']);
  });

  it('should extract variables with multiple occurrences', () => {
    const template = '{{ name }} {{ age }} {{ name }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'age']);
  });

  it('should not extract variables from comments', () => {
    const template = '{# This is a comment with {{ variable }} #}{{ actual_variable }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['actual_variable']);
  });

  it('should handle empty templates', () => {
    const template = '';
    expect(extractVariablesFromTemplate(template)).toEqual([]);
  });

  it('should handle templates without variables', () => {
    const template = 'This is a static template without variables.';
    expect(extractVariablesFromTemplate(template)).toEqual([]);
  });
});

describe('extractVariablesFromTemplates', () => {
  it('should extract variables from multiple templates', () => {
    const templates = [
      'Hello {{ name }}, welcome to {{ place }}!',
      '{{ user.age }} years old',
      '{% for item in items %}{{ item.name }}{% endfor %}',
    ];

    const result = extractVariablesFromTemplates(templates);

    expect(result).toEqual(['name', 'place', 'user.age', 'item.name', 'items']);
  });

  it('should handle empty array of templates', () => {
    const templates: string[] = [];

    const result = extractVariablesFromTemplates(templates);

    expect(result).toEqual([]);
  });

  it('should deduplicate variables across templates', () => {
    const templates = ['Hello {{ name }}!', 'Welcome, {{ name }}!', '{{ age }} years old'];

    const result = extractVariablesFromTemplates(templates);

    expect(result).toEqual(['name', 'age']);
  });
});
