import PropTypes from "prop-types";
import { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";

const ConfirmationModal = ({
  show,
  handleClose,
  handleConfirm,
  title,
  message,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setError("");
  };

  const handleModalClose = () => {
    setInputValue("");
    setError("");
    handleClose();
  };

  const handleConfirmClick = () => {
    if (inputValue.toLowerCase() === t("deleteKeyword")) {
      handleConfirm();
      setInputValue("");
      setError("");
      handleClose();
    } else {
      setError(t("confirmation.typeDeleteToConfirm"));
    }
  };

  return (
    <Modal show={show} onHide={handleModalClose}>
      <Modal.Header closeButton>
        <Modal.Title>{title || t("confirmation.title")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {message ||
            t("confirmation.message", { keyword: t("deleteKeyword") })}
        </p>
        <Form.Control
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={t("confirmation.placeholder", {
            keyword: t("deleteKeyword"),
          })}
        />
        {error && (
          <div className="alert alert-danger mt-2" role="alert">
            {error}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleModalClose}>
          {t("buttons.cancel")}
        </Button>
        <Button variant="danger" onClick={handleConfirmClick}>
          {t("buttons.confirm")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

ConfirmationModal.propTypes = {
  show: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  handleConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string,
};

export default ConfirmationModal;
