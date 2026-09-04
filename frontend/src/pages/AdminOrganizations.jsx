import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useNavbarSearchBinding, useNotify } from '../chrome';

import { adminShape } from './admin';
import ConfirmModal from './ConfirmModal';
import { responseMessage } from './itemShape';
import { ORG_NAME_PATTERN } from './organizations';
import UserCard from './UserCard';

const NO_FILTERS = [];
const clearNothing = () => undefined;

const EMPTY_EDIT = {
  orgCode: '',
  email: '',
  description: '',
  accessMode: 'private',
  defaultRole: 'member',
};

const editOf = details => ({
  orgCode: details.org_code || '',
  email: details.email || '',
  description: details.description || '',
  accessMode: details.access_mode || 'private',
  defaultRole: details.default_role || 'member',
});

const EditOrganizationModal = ({ organization, draft, onChange, onClose, onSave }) => {
  const { t } = useTranslation();
  return (
    <Modal show={Boolean(organization)} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title as="h5">
          {t('orgUserManager.editModal.title', { orgName: organization?.name || '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="form-group mb-3">
          <label htmlFor="editOrgCode">{t('orgUserManager.editModal.orgCode')}</label>
          <input
            type="text"
            className="form-control"
            id="editOrgCode"
            value={draft.orgCode}
            onChange={e =>
              onChange('orgCode', e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))
            }
            maxLength="6"
            pattern="[0-9A-F]{6}"
          />
          <small className="form-text text-muted">
            {t('orgUserManager.editModal.orgCodeHint')}
          </small>
        </div>
        <div className="form-group mb-3">
          <label htmlFor="editOrgEmail">{t('orgUserManager.editModal.orgEmail')}</label>
          <input
            type="email"
            className="form-control"
            id="editOrgEmail"
            value={draft.email}
            onChange={e => onChange('email', e.target.value)}
          />
          <small className="form-text text-muted">
            {t('orgUserManager.editModal.orgEmailHint')}
          </small>
        </div>
        <div className="form-group mb-3">
          <label htmlFor="editOrgDescription">{t('orgUserManager.editModal.description')}</label>
          <textarea
            className="form-control"
            id="editOrgDescription"
            value={draft.description}
            onChange={e => onChange('description', e.target.value)}
            rows="3"
          />
        </div>
        <div className="form-group mb-3">
          <label htmlFor="editOrgAccessMode">{t('orgUserManager.editModal.accessMode')}</label>
          <select
            className="form-control"
            id="editOrgAccessMode"
            value={draft.accessMode}
            onChange={e => onChange('accessMode', e.target.value)}
          >
            <option value="private">{t('orgUserManager.editModal.accessModes.private')}</option>
            <option value="invite_only">
              {t('orgUserManager.editModal.accessModes.inviteOnly')}
            </option>
            <option value="request_to_join">
              {t('orgUserManager.editModal.accessModes.requestToJoin')}
            </option>
          </select>
          <small className="form-text text-muted">
            {t('orgUserManager.editModal.accessModeHint')}
          </small>
        </div>
        <div className="form-group mb-3">
          <label htmlFor="editOrgDefaultRole">{t('orgUserManager.editModal.defaultRole')}</label>
          <select
            className="form-control"
            id="editOrgDefaultRole"
            value={draft.defaultRole}
            onChange={e => onChange('defaultRole', e.target.value)}
          >
            <option value="member">{t('roles.member')}</option>
            <option value="admin">{t('roles.admin')}</option>
          </select>
          <small className="form-text text-muted">
            {t('orgUserManager.editModal.defaultRoleHint')}
          </small>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('admin.buttons.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onSave}>
          {t('admin.buttons.save')}
        </button>
      </Modal.Footer>
    </Modal>
  );
};

EditOrganizationModal.propTypes = {
  organization: PropTypes.shape({ name: PropTypes.string.isRequired }),
  draft: PropTypes.shape({
    orgCode: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    accessMode: PropTypes.string.isRequired,
    defaultRole: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

const OrgTitle = ({ org, renaming, newName, onNameChange, onRename, onCancel }) => {
  const { t } = useTranslation();
  if (renaming) {
    return (
      <form onSubmit={onRename} noValidate>
        <input
          type="text"
          className="form-control"
          value={newName}
          onChange={e => onNameChange(e.target.value)}
        />
        <button className="btn btn-success btn-sm mt-2" type="submit">
          {t('admin.buttons.save')}
        </button>
        <button className="btn btn-secondary btn-sm mt-2 ms-2" type="button" onClick={onCancel}>
          {t('admin.buttons.cancel')}
        </button>
      </form>
    );
  }
  return (
    <Link to={`/${org.name}`} className="card-title">
      {org.org_code
        ? `${org.org_code} - ${org.display_name || org.name}`
        : org.display_name || org.name}
      {org.external_issuer && (
        <span className="badge bg-info ms-2" title={t('orgUserManager.ssoManagedHint')}>
          {t('orgUserManager.ssoManaged')}
        </span>
      )}
    </Link>
  );
};

OrgTitle.propTypes = {
  org: PropTypes.object.isRequired,
  renaming: PropTypes.bool.isRequired,
  newName: PropTypes.string.isRequired,
  onNameChange: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

/**
 * The Organizations and users tab of the admin page: every organization
 * with its members as `UserCard` rows, searched from the navbar; edit,
 * rename, suspend, resume and delete on the organization, suspend, resume,
 * remove and delete on its members, every call through the app's `admin`
 * adapter, and a rename of the active organization stored under
 * `activeOrgKey` with the session refreshed.
 */
const AdminOrganizations = ({ session, activeOrgKey, admin }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [organizations, setOrganizations] = useState([]);
  const [renamingId, setRenamingId] = useState(null);
  const [newOrgName, setNewOrgName] = useState('');
  const [oldName, setOldName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [draft, setDraft] = useState(EMPTY_EDIT);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const current = session.restore();
  const currentUser = current ? current.user : null;

  useEffect(() => {
    admin.organizationsWithUsers().then(setOrganizations, () => null);
  }, [admin]);

  const checkOrganizationExists = async name => {
    try {
      return Boolean(await admin.organization(name));
    } catch {
      return false;
    }
  };

  const dropMember = (predicate, userId) =>
    setOrganizations(previous =>
      previous.map(org =>
        predicate(org) ? { ...org, members: org.members.filter(user => user.id !== userId) } : org
      )
    );

  const handleDeleteOrganization = organizationName => {
    admin
      .removeOrganization(organizationName)
      .then(() => {
        setOrganizations(previous => previous.filter(org => org.name !== organizationName));
      })
      .catch(() => notify('danger', t('admin.messages.deleteFailed')));
  };

  const handleDeleteUser = userId => {
    admin
      .removeUser(userId)
      .then(() => dropMember(() => true, userId))
      .catch(() => notify('danger', t('admin.messages.deleteFailed')));
  };

  const askDelete = item => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const closeDelete = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const confirmDelete = () => {
    if (!itemToDelete) {
      return;
    }
    if (itemToDelete.type === 'user') {
      handleDeleteUser(itemToDelete.id);
    } else if (itemToDelete.type === 'organization') {
      handleDeleteOrganization(itemToDelete.name);
    } else if (itemToDelete.type === 'user_remove') {
      admin
        .removeMember(itemToDelete.orgName, itemToDelete.id)
        .then(() => dropMember(org => org.name === itemToDelete.orgName, itemToDelete.id))
        .catch(() => notify('danger', t('orgConsole.users.removeError')));
    }
    closeDelete();
  };

  const handleSuspendOrResumeUser = (userId, isSuspended) => {
    const action = isSuspended ? admin.resumeUser(userId) : admin.suspendUser(userId);
    action
      .then(() => {
        setOrganizations(previous =>
          previous.map(org => ({
            ...org,
            members: org.members.map(user =>
              user.id === userId ? { ...user, suspended: !isSuspended } : user
            ),
          }))
        );
      })
      .catch(() => notify('danger', t('admin.messages.operationFailed')));
  };

  const handleSuspendOrResumeOrganization = (organizationName, isSuspended) => {
    const action = isSuspended
      ? admin.resumeOrganization(organizationName)
      : admin.suspendOrganization(organizationName);
    action
      .then(() => {
        setOrganizations(previous =>
          previous.map(org =>
            org.name === organizationName ? { ...org, suspended: !isSuspended } : org
          )
        );
      })
      .catch(() => notify('danger', t('admin.messages.operationFailed')));
  };

  const handleRenameOrganization = async e => {
    e.preventDefault();

    if (!ORG_NAME_PATTERN.test(newOrgName)) {
      notify('danger', t('orgUserManager.invalidOrgName'));
      return;
    }
    if (newOrgName === oldName) {
      notify('danger', t('orgUserManager.rename.sameNameError'));
      return;
    }
    if (await checkOrganizationExists(newOrgName)) {
      notify('danger', t('orgUserManager.rename.orgExistsError'));
      return;
    }

    try {
      await admin.updateOrganization(oldName, { organization: newOrgName });

      if (currentUser && currentUser.organization === oldName) {
        localStorage.setItem(activeOrgKey, newOrgName);
        await session.refresh();
      }

      setOrganizations(previous =>
        previous.map(org => (org.name === oldName ? { ...org, name: newOrgName } : org))
      );
      setRenamingId(null);
      setNewOrgName('');
      setOldName('');
      notify('success', t('orgUserManager.rename.success'));
    } catch {
      notify('danger', t('orgUserManager.rename.error'));
    }
  };

  const openEdit = async org => {
    const details = await admin.organization(org.name);
    setEditingOrg(details);
    setDraft(editOf(details));
  };

  const saveEdit = async () => {
    try {
      await admin.updateOrganization(editingOrg.name, {
        organization: editingOrg.name,
        org_code: draft.orgCode,
        email: draft.email,
        description: draft.description,
      });
      await admin.accessMode(editingOrg.name, draft.accessMode, draft.defaultRole);
      notify('success', t('orgUserManager.editModal.updateSuccess'));
      setEditingOrg(null);
    } catch (error) {
      notify('danger', responseMessage(error, t('orgUserManager.editModal.updateError')));
    }
  };

  const term = searchTerm.toLowerCase();
  const filteredOrganizations = organizations.filter(
    org =>
      !term ||
      org.name.toLowerCase().includes(term) ||
      (org.org_code && org.org_code.toLowerCase().includes(term))
  );

  useNavbarSearchBinding({
    query: searchTerm,
    onQueryChange: setSearchTerm,
    placeholder: t('orgUserManager.searchPlaceholder'),
    matched: filteredOrganizations.length,
    total: organizations.length,
    groups: NO_FILTERS,
    onClearFilters: clearNothing,
  });

  return (
    <>
      <div className="row">
        {filteredOrganizations.map(org => (
          <div className="col-md-6" key={org.id}>
            <div className="card mt-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <OrgTitle
                  org={org}
                  renaming={renamingId === org.id}
                  newName={newOrgName}
                  onNameChange={setNewOrgName}
                  onRename={handleRenameOrganization}
                  onCancel={() => setRenamingId(null)}
                />
                <div>
                  <button
                    type="button"
                    className="btn btn-info btn-sm me-2"
                    onClick={() => openEdit(org)}
                  >
                    {t('admin.buttons.edit')}
                  </button>
                  {!org.external_issuer && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm me-2"
                      onClick={() => {
                        setRenamingId(org.id);
                        setNewOrgName(org.name);
                        setOldName(org.name);
                      }}
                    >
                      {t('admin.buttons.rename')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn btn-${org.suspended ? 'success' : 'warning'} btn-sm me-2`}
                    onClick={() => handleSuspendOrResumeOrganization(org.name, org.suspended)}
                  >
                    {org.suspended ? t('admin.buttons.resume') : t('admin.buttons.suspend')}
                  </button>
                  {!org.external_issuer && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => askDelete({ type: 'organization', name: org.name })}
                    >
                      {t('admin.buttons.delete')}
                    </button>
                  )}
                </div>
              </div>
              <div className="card-body">
                <p>{t('orgUserManager.totalBoxes', { count: org.totalBoxes })}</p>
                <div className="row">
                  {org.members.map(user => (
                    <UserCard
                      key={user.id}
                      user={user}
                      currentUser={currentUser}
                      orgRole={user.orgRole}
                      columnClass="col-12 col-xxl-6"
                      gravatarProfile={admin.gravatarProfile}
                      onSuspend={() => handleSuspendOrResumeUser(user.id, false)}
                      onResume={() => handleSuspendOrResumeUser(user.id, true)}
                      onRemoveFromOrg={
                        org.external_issuer
                          ? undefined
                          : () => askDelete({ type: 'user_remove', id: user.id, orgName: org.name })
                      }
                      onDelete={() => askDelete({ type: 'user', id: user.id })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <ConfirmModal
        show={showDeleteModal}
        handleClose={closeDelete}
        handleConfirm={confirmDelete}
      />
      <EditOrganizationModal
        organization={editingOrg}
        draft={draft}
        onChange={(field, value) => setDraft(previous => ({ ...previous, [field]: value }))}
        onClose={() => setEditingOrg(null)}
        onSave={saveEdit}
      />
    </>
  );
};

AdminOrganizations.propTypes = {
  session: PropTypes.object.isRequired,
  activeOrgKey: PropTypes.string.isRequired,
  admin: adminShape.isRequired,
};

export default AdminOrganizations;
