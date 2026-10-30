"""Content-based recommendations using TensorFlow text vectors and cosine similarity."""
import math
import os
import re
from collections import Counter

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import tensorflow as tf
from flask import Flask, jsonify, request
from waitress import serve

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024


def number(value, label):
    if isinstance(value, bool):
        raise ValueError(f'{label} must be a non-negative number')
    try:
        result = float(value)
    except (ValueError, TypeError):
        raise ValueError(f'{label} must be a non-negative number') from None
    if not math.isfinite(result) or result < 0:
        raise ValueError(f'{label} must be a non-negative number')
    return result


def tokens(text):
    return re.findall(r'\w+', text.lower(), flags=re.UNICODE)


def recommend(body):
    if not isinstance(body, dict):
        raise ValueError('A JSON object is required')
    packages = body.get('packages')
    preferences = body.get('preferences', {})
    if not isinstance(packages, list) or len(packages) > 500:
        raise ValueError('packages must be a list of at most 500 items')
    if not isinstance(preferences, dict):
        raise ValueError('preferences must be an object')
    query = preferences.get('interests', '')
    if not isinstance(query, str) or not query.strip() or len(query) > 500:
        raise ValueError('interests must contain 1–500 characters')
    limit = body.get('limit', 5)
    if type(limit) is not int or not 1 <= limit <= 20:
        raise ValueError('limit must be an integer from 1 to 20')
    budget = preferences.get('budget')
    budget = number(budget, 'budget') if budget is not None else None
    candidates, documents = [], []
    for p in packages:
        if not isinstance(p, dict):
            raise ValueError('Each package must be an object')
        if not isinstance(p.get('status', 'Active'), str):
            raise ValueError('status must be a string')
        if p.get('isActive') is False or p.get('status', 'Active').lower() != 'active':
            continue
        price = number(p.get('price', 0), 'price')
        if budget is not None and (price <= 0 or price > budget):
            continue
        fields = [p.get(k, '') for k in ('name', 'title', 'dest', 'destination', 'location', 'category', 'description', 'dur', 'durationLabel')]
        if any(not isinstance(v, str) or len(v) > 10000 for v in fields):
            raise ValueError('Package text fields must be strings of at most 10000 characters')
        if not isinstance(p.get('id'), str) or not p['id']:
            raise ValueError('Each package needs a string id')
        candidates.append(p)
        documents.append(tokens(' '.join(fields)))
    if not candidates:
        return []
    # Fit IDF to this catalog; no fabricated training data or booking history.
    frequencies = Counter(word for doc in documents for word in doc)
    vocabulary = sorted(word for word, _ in frequencies.most_common(4096))
    if not vocabulary:
        return []
    index = {word: i for i, word in enumerate(vocabulary)}
    counts = Counter(word for doc in documents for word in set(doc))
    idf = [math.log((1 + len(documents)) / (1 + counts[word])) + 1 for word in vocabulary]

    def vector(words):
        values = [0.0] * len(vocabulary)
        for word, count in Counter(words).items():
            if word in index:
                i = index[word]
                values[i] = count * idf[i]
        return values

    matrix = tf.math.l2_normalize(tf.constant([vector(doc) for doc in documents], dtype=tf.float32), axis=1)
    user = tf.math.l2_normalize(tf.constant([vector(tokens(query))], dtype=tf.float32), axis=1)
    scores = tf.linalg.matvec(matrix, user[0]).numpy().tolist()
    ranking = sorted(enumerate(scores), key=lambda item: (-item[1], candidates[item[0]]['id']))
    return [{'id': candidates[i]['id'], 'score': round(min(1.0, score), 4)} for i, score in ranking if score > 0][:limit]


@app.get('/health')
def health():
    return jsonify(status='ok', engine='tensorflow-tfidf-cosine', tensorflow=tf.__version__)


@app.post('/recommend')
def recommendations():
    try:
        return jsonify(recommendations=recommend(request.get_json()), engine='tensorflow-tfidf-cosine')
    except ValueError as err:
        return jsonify(error=str(err)), 400


if __name__ == '__main__':
    serve(app, host='127.0.0.1', port=int(os.environ.get('AI_PORT', '5001')), threads=2)
