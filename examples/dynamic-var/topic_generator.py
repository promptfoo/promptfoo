# In this example, we're going to randomly select a topic from a list of topics.
# In practice, you might do something like fetch context from a vector database
# such as Pinecone, Chroma, etc.

import random

fruits = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape']
print(random.choice(fruits))
