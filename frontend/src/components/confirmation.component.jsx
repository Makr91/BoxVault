import PropTypes from "prop-types";
import { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";

const ConfirmationModal = ({ show, handleClose, handleConfirm }) => {
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
    if (inputValue.toLowerCase() === "delete") {
      handleConfirm();
      setInputValue("");
      setError("");
      handleClose();
    } else {
      setError("Please type 'delete' to confirm.");
    }
  };

  return (
    <Modal show={show} onHide={handleModalClose}>
      <Modal.Header closeButton>
        <Modal.Title>Confirm Deletion</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Please type &quot;delete&quot; to confirm the deletion.</p>
        <Form.Control
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Type 'delete' to confirm"
        />
        {error && (
          <div className="alert alert-danger mt-2" role="alert">
            {error}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleModalClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirmClick}>
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

ConfirmationModal.propTypes = {
  show: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  handleConfirm: PropTypes.func.isRequired,
};

export default ConfirmationModal;
