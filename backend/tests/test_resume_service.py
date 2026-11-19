import io
import unittest
import uuid
from unittest.mock import patch

from cloudinary.exceptions import AuthorizationRequired
from fastapi import HTTPException

from app.services.resume_service import (
    CLOUDINARY_FOLDER,
    delete_resume_from_cloudinary,
    upload_resume_to_cloudinary,
)


class ResumeCloudinaryTests(unittest.TestCase):
    def test_upload_passes_pdf_filename_and_returns_provider_public_id(self):
        resume_id = uuid.uuid4()
        pdf_bytes = b"%PDF-1.7\nsynthetic test document"
        secure_url = "https://res.cloudinary.com/test/raw/upload/resume.pdf"
        public_id = f"{resume_id}.pdf"

        with (
            patch("app.services.resume_service._configure_cloudinary"),
            patch(
                "app.services.resume_service.cloudinary.uploader.upload",
                return_value={"secure_url": secure_url, "public_id": public_id},
            ) as upload,
        ):
            result = upload_resume_to_cloudinary(pdf_bytes, resume_id)

        self.assertEqual(result, (secure_url, public_id))
        uploaded_file = upload.call_args.args[0]
        self.assertIsInstance(uploaded_file, io.BytesIO)
        self.assertEqual(uploaded_file.read(), pdf_bytes)
        self.assertEqual(
            upload.call_args.kwargs,
            {
                "resource_type": "raw",
                "folder": CLOUDINARY_FOLDER,
                "public_id": public_id,
                "overwrite": True,
                "filename": public_id,
            },
        )

    def test_authorization_error_returns_actionable_configuration_response(self):
        with (
            patch("app.services.resume_service._configure_cloudinary"),
            patch(
                "app.services.resume_service.cloudinary.uploader.upload",
                side_effect=AuthorizationRequired("Invalid cloud_name"),
            ),
            self.assertLogs("app.services.resume_service", level="ERROR"),
        ):
            with self.assertRaises(HTTPException) as raised:
                upload_resume_to_cloudinary(b"%PDF-1.7", uuid.uuid4())

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("Cloudinary cloud name", raised.exception.detail)
        self.assertNotIn("Invalid cloud_name", raised.exception.detail)

    def test_cleanup_uses_cloudinary_public_id(self):
        public_id = f"{uuid.uuid4()}.pdf"

        with (
            patch("app.services.resume_service._configure_cloudinary"),
            patch(
                "app.services.resume_service.cloudinary.uploader.destroy",
                return_value={"result": "ok"},
            ) as destroy,
        ):
            delete_resume_from_cloudinary(public_id)

        destroy.assert_called_once_with(public_id, resource_type="raw")


if __name__ == "__main__":
    unittest.main()
