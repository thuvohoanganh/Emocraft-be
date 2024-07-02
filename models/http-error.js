class HttpError extends Error {
    constructor(message, errorCode, errorData) {
      super(message); // Add a "message" property
      this.code = errorCode; // Adds a "code" property
      this.data = errorData
    }
  }
  
  module.exports = HttpError;