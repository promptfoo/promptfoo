// Returns a fixed JSON response with age=31 (different from expected age=30)
class FixedJsonProvider {
  id() {
    return 'fixed-json';
  }

  async callApi(prompt) {
    return {
      output: JSON.stringify({
        name: 'John',
        age: 31, // Different from expected (30)
        city: 'New York',
        nested: {
          foo: 'bar',
          baz: 123,
        },
      }),
    };
  }
}

module.exports = FixedJsonProvider;
