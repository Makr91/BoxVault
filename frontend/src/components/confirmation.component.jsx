// ConfirmationModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

const ConfirmationModal = ({ show, handleClose, handleConfirm }) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (show) {
      setInputValue(''); // Reset input value when modal is shown
    }
  }, [show]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleConfirmClick = () => {
    if (inputValue.toLowerCase() === 'delete') {
      handleConfirm();
      handleClose();
    } else {
      alert('Please type "delete" to confirm.');
    }
  };

  return (
    <Modal show={show} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>Confirm Deletion</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Please type "delete" to confirm the deletion.</p>
        <Form.Control
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Type 'delete' to confirm"
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirmClick}>
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmationModal;