class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Maps errors raised by save_medical_record() and PostgREST to HTTP responses.
function fromSupabase(error) {
  if (!error) return null;
  switch (error.code) {
    case '42501':
      return new HttpError(403, error.message || 'Not allowed');
    case 'P0002':
      return new HttpError(404, error.message || 'Not found');
    case 'P0001':
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
    case '23514':
      return new HttpError(400, error.code === 'P0001' ? error.message : 'Some values are invalid. Please check the form.');
    case '23505':
      return new HttpError(409, 'A record with these details already exists');
    default:
      console.error('Supabase error:', error);
      return new HttpError(500, 'Something went wrong. Please try again.');
  }
}

module.exports = { HttpError, fromSupabase };
