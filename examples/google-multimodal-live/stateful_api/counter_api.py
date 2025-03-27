import flask

app = flask.Flask(__name__)

counter = 3


@app.route('/add_one', methods=['POST'])
def add_one():
  global counter
  counter += 1
  return {}


@app.route('/get_count', methods=['GET'])
def get_count():
  return flask.jsonify({'counter': counter})


@app.route('/get_state', methods=['GET'])
def get_state():
  return flask.jsonify({'counter': counter})


@app.route('/shutdown', methods=['POST'])
def shutdown():
  func = flask.request.environ.get('werkzeug.server.shutdown')
  if func is None:
    return flask.jsonify(
        {'message': 'Error: not running with the Werkzeug Server'}
    )
  func()
  return flask.jsonify({'message': 'Server shutting down...'})


if __name__ == '__main__':
  app.run(port=5000)
