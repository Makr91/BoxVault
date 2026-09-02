import PropTypes from 'prop-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { responseMessage } from '../pages';
import AuthService from '../services/auth.service';
import BoxService from '../services/box.service';
import OrganizationService from '../services/organization.service';
import { log } from '../utils/Logger';
import { isGlobalAdmin, isOrgManager, isOrgMember } from '../utils/permissions';

import ConfirmationModal from './confirmation.component';

const NAME_RE = /^[0-9a-zA-Z-._]+$/;
const EMPTY_BOX = { name: '', description: '', isPublic: false };

const CreateBoxForm = ({ org, draft, nameError, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="create-form mt-2 mb-3 w-100">
      <h4>{t('box.organization.headers.createNewBox')}</h4>
      <form>
        <div className="form-group">
          <label htmlFor="boxName">
            <strong>{t('box.name')}:</strong>
          </label>
          <div className="form-group row align-items-center">
            <div className="col-auto pe-0">
              <input type="text" className="form-control" id="organization" value={org} disabled />
            </div>
            <div className="col-auto px-1">
              <span className="font-size-xl font-weight-bolder">/</span>
            </div>
            <div className="col-auto ps-0">
              <input
                type="text"
                className="form-control"
                id="boxName"
                name="name"
                value={draft.name}
                onChange={onChange}
                required
              />
            </div>
          </div>
          {nameError ? <div className="text-danger">{nameError}</div> : null}
          <small className="form-text text-muted">{t('box.shortDescription')}</small>
        </div>
        <div className="form-group mt-2">
          <label htmlFor="description">
            <strong>{t('box.description')}:</strong>
          </label>
          <textarea
            className="form-control"
            id="description"
            name="description"
            value={draft.description}
            onChange={onChange}
            rows="3"
          />
        </div>
        <div className="form-group mt-2">
          <label htmlFor="visibilityPrivate">
            <strong>{t('box.visibility')}:</strong>
          </label>
          <div>
            <div className="form-check">
              <input
                type="radio"
                className="form-check-input"
                id="visibilityPrivate"
                name="isPublic"
                value="false"
                checked={!draft.isPublic}
                onChange={onChange}
              />
              <label className="form-check-label" htmlFor="visibilityPrivate">
                {t('box.organization.visibility.private')}
              </label>
            </div>
            <div className="form-check">
              <input
                type="radio"
                className="form-check-input"
                id="visibilityPublic"
                name="isPublic"
                value="true"
                checked={draft.isPublic}
                onChange={onChange}
              />
              <label className="form-check-label" htmlFor="visibilityPublic">
                {t('box.organization.visibility.public')}
              </label>
            </div>
          </div>
          <small className="form-text text-muted">{t('box.visibilityHint')}</small>
        </div>
      </form>
    </div>
  );
};

CreateBoxForm.propTypes = {
  org: PropTypes.string.isRequired,
  draft: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    isPublic: PropTypes.bool.isRequired,
  }).isRequired,
  nameError: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

const JoinAsOwner = ({ org, notify }) => {
  const { t } = useTranslation();
  const join = () => {
    OrganizationService.joinOrganizationAsAdmin(org)
      .then(async () => {
        await AuthService.refreshUserData();
        window.location.reload();
      })
      .catch(error => {
        log.api.error('Error joining organization as admin', { org, error: error.message });
        notify('danger', responseMessage(error, t('messages.operationFailed')));
      });
  };
  return (
    <button type="button" className="btn btn-sm btn-outline-warning" onClick={join}>
      {t('box.organization.buttons.joinAsAdmin')}
    </button>
  );
};

JoinAsOwner.propTypes = {
  org: PropTypes.string.isRequired,
  notify: PropTypes.func.isRequired,
};

const RemoveAll = ({ org, reload, notify }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const removeAll = () => {
    BoxService.removeAll(org)
      .then(() => {
        notify('success', t('box.organization.messages.removeAllSuccess'));
        reload();
      })
      .catch(error => {
        log.api.error('Error removing all boxes', { org, error: error.message });
        notify('danger', t('box.organization.errors.removeAll'));
      });
  };
  return (
    <>
      <button type="button" className="btn btn-sm btn-danger" onClick={() => setShow(true)}>
        {t('box.organization.buttons.removeAll')}
      </button>
      <ConfirmationModal show={show} handleClose={() => setShow(false)} handleConfirm={removeAll} />
    </>
  );
};

RemoveAll.propTypes = {
  org: PropTypes.string.isRequired,
  reload: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
};

export const BoxListActions = ({ ctx }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, org, reload, notify } = ctx;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_BOX);
  const [nameError, setNameError] = useState('');

  if (!org || !user) {
    return null;
  }

  const onChange = event => {
    const { name, value } = event.target;
    setDraft(current => ({ ...current, [name]: name === 'isPublic' ? value === 'true' : value }));
    if (name === 'name') {
      setNameError(NAME_RE.test(value) ? '' : t('validation.invalidName'));
    }
  };

  const cancel = () => {
    setCreating(false);
    setDraft(EMPTY_BOX);
    setNameError('');
  };

  const create = () => {
    if (!creating) {
      setCreating(true);
      return;
    }
    BoxService.create(org, { ...draft, organization: org })
      .then(() => {
        notify('success', t('box.organization.messages.boxCreated'));
        cancel();
        navigate(`/${org}/${draft.name}`);
      })
      .catch(error => {
        log.api.error('Error creating box', { boxName: draft.name, error: error.message });
        notify('danger', responseMessage(error, t('box.organization.errors.boxCreate')));
      });
  };

  return (
    <>
      {isGlobalAdmin(user) && !isOrgMember(user, org) ? (
        <JoinAsOwner org={org} notify={notify} />
      ) : null}
      {isOrgMember(user, org) ? (
        <>
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={create}
            disabled={creating && (!draft.name || Boolean(nameError))}
          >
            {creating
              ? t('box.organization.buttons.createBox')
              : t('box.organization.buttons.createNewBox')}
          </button>
          {creating ? (
            <button type="button" className="btn btn-sm btn-secondary" onClick={cancel}>
              {t('buttons.cancel')}
            </button>
          ) : null}
        </>
      ) : null}
      {isOrgManager(user, org) ? <RemoveAll org={org} reload={reload} notify={notify} /> : null}
      {creating ? (
        <CreateBoxForm org={org} draft={draft} nameError={nameError} onChange={onChange} />
      ) : null}
    </>
  );
};

BoxListActions.propTypes = {
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
  }).isRequired,
};
