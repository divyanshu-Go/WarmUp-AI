import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services import interview_turn_service
from app.services.groq_service import GroqNotConfiguredError, GroqProviderError


class FakeSession:
    def __init__(self, interview, question):
        self.results = [interview, question]

    def scalar(self, _statement):
        return self.results.pop(0)

    def commit(self):
        pass

    def rollback(self):
        pass


class EvaluateAnswerFailureTests(unittest.TestCase):
    def setUp(self):
        self.interview = SimpleNamespace(
            id=uuid.uuid4(),
            status="in_progress",
        )
        self.question = SimpleNamespace(
            id=uuid.uuid4(),
            sequence_number=1,
            stage="introduction",
            topic="General",
            text="Tell me about your experience.",
        )
        self.answer = SimpleNamespace(
            id=uuid.uuid4(),
            question_id=self.question.id,
            transcript="I built a service.",
            status="ready_for_next",
        )
        self.db = FakeSession(self.interview, self.question)

    def _invoke_with_error(self, error):
        with patch.object(
            interview_turn_service,
            "evaluate_single_turn_brutally",
            side_effect=error,
        ):
            with self.assertLogs(
                "app.services.interview_turn_service",
                level="ERROR",
            ):
                with self.assertRaises(HTTPException) as raised:
                    interview_turn_service.evaluate_answer_and_prepare_next_turn(
                        db=self.db,
                        answer=self.answer,
                        user_id=uuid.uuid4(),
                        interview_id=self.interview.id,
                    )

        return raised.exception

    def test_missing_ai_configuration_returns_503(self):
        error = self._invoke_with_error(GroqNotConfiguredError())

        self.assertEqual(error.status_code, 503)
        self.assertEqual(
            error.detail["message"],
            "Interview AI is not configured. Please try again later.",
        )
        self.assertEqual(self.answer.status, "evaluation_failed")

    def test_ai_provider_failure_returns_502(self):
        error = self._invoke_with_error(GroqProviderError())

        self.assertEqual(error.status_code, 502)
        self.assertEqual(
            error.detail["message"],
            "Unable to prepare the next interview turn. Please try again.",
        )
        self.assertEqual(self.answer.status, "evaluation_failed")

    def test_unexpected_failure_keeps_generic_500(self):
        error = self._invoke_with_error(RuntimeError("unexpected failure"))

        self.assertEqual(error.status_code, 500)
        self.assertEqual(
            error.detail["message"],
            "Failed to prepare adaptive interview turn. You can retry.",
        )
        self.assertEqual(self.answer.status, "evaluation_failed")


if __name__ == "__main__":
    unittest.main()
