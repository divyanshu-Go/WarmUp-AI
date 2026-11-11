import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import groq_service


class TurnEvaluationOutputTests(unittest.TestCase):
    def test_verdict_is_derived_when_provider_omits_it(self):
        response_data = {
            "question_number": 1,
            "stage": "project",
            "topic": "Deployments",
            "question_asked": "How did you deploy the service?",
            "candidate_transcript": "We used a rolling deployment.",
            "blunt_critique": "The answer lacked rollback details.",
            "ideal_sample_answer": "Describe rollout and rollback safeguards.",
        }
        client = MagicMock()
        client.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(response_data))
                )
            ]
        )

        with patch.object(groq_service, "_get_client", return_value=client):
            for score, expected_verdict in (
                (1, "Unsatisfactory"),
                (2, "Weak"),
                (3, "Adequate"),
                (4, "Strong"),
                (5, "Exceptional"),
            ):
                with self.subTest(score=score):
                    response_data["score"] = score
                    client.chat.completions.create.return_value.choices[
                        0
                    ].message.content = json.dumps(response_data)
                    result = groq_service.evaluate_single_turn_brutally(
                        question_number=1,
                        stage="project",
                        topic="Deployments",
                        question_text="How did you deploy the service?",
                        answer_transcript="We used a rolling deployment.",
                    )

                    self.assertEqual(result.score, score)
                    self.assertEqual(result.verdict, expected_verdict)


if __name__ == "__main__":
    unittest.main()
