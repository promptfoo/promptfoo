import ragas.metrics
print("Available metrics in ragas.metrics:")
print([attr for attr in dir(ragas.metrics) if not attr.startswith('_')])