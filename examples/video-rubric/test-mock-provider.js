/**
 * Mock video provider for testing video-rubric assertions.
 * Returns a small sample video in the response.
 */
module.exports = class MockVideoProvider {
  id() {
    return 'mock-video-provider';
  }

  async callApi(prompt) {
    // Return a mock video response with a publicly accessible video URL
    // This is a small sample video from a public source
    return {
      output: prompt,
      video: {
        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        format: 'mp4',
        duration: 15,
        model: 'mock-video',
      },
    };
  }
};
