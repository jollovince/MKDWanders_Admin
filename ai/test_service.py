import unittest
from service import app


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.packages = [
            {'id': 'beach', 'name': 'Palawan beach island', 'price': 5000},
            {'id': 'city', 'name': 'Manila city museum', 'price': 2000},
            {'id': 'inactive', 'name': 'Palawan beach', 'price': 1000, 'status': 'Inactive'},
        ]

    def post(self, **changes):
        body = {'packages': self.packages, 'preferences': {'interests': 'beach Palawan'}}
        body.update(changes)
        return self.client.post('/recommend', json=body)

    def test_ranks_matching_active_packages(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual([r['id'] for r in response.json['recommendations']], ['beach'])

    def test_budget_is_hard_limit(self):
        response = self.post(preferences={'interests': 'beach Palawan', 'budget': 3000})
        self.assertEqual(response.json['recommendations'], [])

    def test_empty_and_unknown_interests(self):
        self.assertEqual(self.post(packages=[]).json['recommendations'], [])
        self.assertEqual(self.post(preferences={'interests': 'skiing'}).json['recommendations'], [])

    def test_validation(self):
        for body in [None, [], {'packages': 'bad'}, {'packages': self.packages, 'preferences': {'interests': 'beach', 'budget': -1}}, {'packages': self.packages, 'preferences': {'interests': 'beach'}, 'limit': 0}]:
            response = self.client.post('/recommend', json=body, content_type='application/json')
            self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
