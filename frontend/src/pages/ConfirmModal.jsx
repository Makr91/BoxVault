import PropTypes from 'prop-types';
import { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

const ConfirmModal = ({ show, handleClose, handleConfirm, title = '', message = '' }) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const keyword = t('pages.confirm.keyword');

  const handleInputChange = event => {
    setInputValue(event.target.value);
    setError('');
  };

  const handleModalClose = () => {
    setInputValue('');
    setError('');
    handleClose();
  };

  const handleConfirmClick = () => {
    if (inputValue.toLowerCase() === keyword) {
      handleConfirm();
      setInputValue('');
      setError('');
      handleClose();
    } else {
      setError(t('pages.confirm.typeToConfirm', { keyword }));
    }
  };

  return (
    <Modal show={show} onHide={handleModalClose}>
      <Modal.Header closeButton>
        <Modal.Title>{title || t('pages.confirm.title')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{message || t('pages.confirm.message', { keyword })}</p>
        <Form.Control
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={t('pages.confirm.placeholder', { keyword })}
        />
        {error ? (
          <div className="alert alert-danger mt-2" role="alert">
            {error}
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleModalClose}>
          {t('pages.confirm.cancel')}
        </Button>
        <Button variant="danger" onClick={handleConfirmClick}>
          {t('pages.confirm.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

ConfirmModal.propTypes = {
  show: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  handleConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string,
};

export default ConfirmModal;
