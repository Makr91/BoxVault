import { encodePath, fetchWithDeduplication, log } from '../chrome';
import { client } from '../chromeProps';

import { uploadChunked } from './uploadChunked';

const PUBLIC = { auth: false };

const isAbort = error => error?.name === 'CanceledError' || error?.name === 'AbortError';

const org = organization => encodePath('api', 'organization', organization);
const box = (organization, name) => `${org(organization)}${encodePath('box', name)}`;
const version = (organization, name, number) =>
  `${box(organization, name)}${encodePath('version', number)}`;
const provider = (organization, name, number, providerName) =>
  `${version(organization, name, number)}${encodePath('provider', providerName)}`;
const architecture = (organization, name, number, providerName, architectureName) =>
  `${provider(organization, name, number, providerName)}${encodePath('architecture', architectureName)}`;
const iso = (organization, isoId) => `${org(organization)}${encodePath('iso', isoId)}`;
const user = userId => encodePath('api', 'users', userId);
const setupAuth = token => ({ ...PUBLIC, headers: { Authorization: `Bearer ${token}` } });

const fileInfo = (organization, name, number, providerName, architectureName) =>
  client.get(
    `${architecture(organization, name, number, providerName, architectureName)}/file/info`
  );

const gravatarProfile = (emailHash, signal) =>
  fetchWithDeduplication(emailHash, hash =>
    client.get(encodePath('api', 'gravatar', 'profile', hash), { ...PUBLIC, signal })
  ).catch(error => {
    if (!isAbort(error)) {
      log.api.error('Error fetching Gravatar profile', { emailHash, error: error.message });
    }
    return null;
  });

const uploadBoxFile = (file, options, onUploadProgress) => {
  const { organization, name, version: number, provider: providerName } = options;
  const { architecture: architectureName, checksum, checksumType } = options;
  return uploadChunked({
    client,
    path: `${architecture(organization, name, number, providerName, architectureName)}/file/upload`,
    file,
    checksum,
    checksumType,
    info: () => fileInfo(organization, name, number, providerName, architectureName),
    onUploadProgress,
  });
};

const uploadSslForm = (token, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/api/setup/upload-ssl', form, { ...setupAuth(token), contentType: 'form' });
};

/**
 * Every BoxVault API call, one line each over the API client; every call
 * resolves to the response body and rejects with `ApiError`. Paths are built
 * from raw names through `encodePath`.
 */
export const api = {
  auth: {
    methods: () => client.get('/api/auth/methods', PUBLIC),
    register: body => client.post('/api/auth/signup', body, PUBLIC),
    validateInvitation: token =>
      client.get(encodePath('api', 'auth', 'validate-invitation', token), PUBLIC),
    acceptInvitation: token =>
      client.post(`${encodePath('api', 'auth', 'invitations', token)}/accept`, {}),
    resendVerification: signal => client.post('/api/auth/resend-verification', {}, { signal }),
    verifyMail: token => client.get(encodePath('api', 'auth', 'verify-mail', token), PUBLIC),
    invite: body => client.post('/api/auth/invite', body),
  },
  gravatar: { profile: gravatarProfile },
  boxes: {
    discover: () => client.get('/api/discover'),
    list: organization => client.get(`${org(organization)}/box`),
    get: (organization, name) => client.get(box(organization, name)),
    create: (organization, body) => client.post(`${org(organization)}/box`, body),
    update: (organization, name, body) => client.put(box(organization, name), body),
    remove: (organization, name) => client.delete(box(organization, name)),
    removeAll: organization => client.delete(`${org(organization)}/box`),
    watch: (organization, name) => client.post(`${box(organization, name)}/watch`, {}),
    unwatch: (organization, name) => client.delete(`${box(organization, name)}/watch`),
    watches: () => client.get('/api/user/watches'),
  },
  versions: {
    list: (organization, name) => client.get(`${box(organization, name)}/version`),
    get: (organization, name, number) => client.get(version(organization, name, number)),
    create: (organization, name, body) => client.post(`${box(organization, name)}/version`, body),
    update: (organization, name, number, body) =>
      client.put(version(organization, name, number), body),
    remove: (organization, name, number) => client.delete(version(organization, name, number)),
  },
  providers: {
    list: (organization, name, number) =>
      client.get(`${version(organization, name, number)}/provider`),
    get: (organization, name, number, providerName) =>
      client.get(provider(organization, name, number, providerName)),
    create: (organization, name, number, body) =>
      client.post(`${version(organization, name, number)}/provider`, body),
    update: (organization, name, number, providerName, body) =>
      client.put(provider(organization, name, number, providerName), body),
    remove: (organization, name, number, providerName) =>
      client.delete(provider(organization, name, number, providerName)),
  },
  architectures: {
    list: (organization, name, number, providerName) =>
      client.get(`${provider(organization, name, number, providerName)}/architecture`),
    create: (organization, name, number, providerName, body) =>
      client.post(`${provider(organization, name, number, providerName)}/architecture`, body),
    remove: (organization, name, number, providerName, architectureName) =>
      client.delete(architecture(organization, name, number, providerName, architectureName)),
  },
  files: {
    info: fileInfo,
    remove: (organization, name, number, providerName, architectureName) =>
      client.delete(
        `${architecture(organization, name, number, providerName, architectureName)}/file/delete`
      ),
    downloadLink: (organization, name, number, providerName, architectureName) =>
      client
        .post(
          `${architecture(organization, name, number, providerName, architectureName)}/file/get-download-link`,
          {}
        )
        .then(data => data.downloadUrl),
    upload: uploadBoxFile,
  },
  isos: {
    list: organization => client.get(`${org(organization)}/iso`),
    discover: () => client.get('/api/isos/discover'),
    upload: (organization, file, isPublic, onUploadProgress) =>
      client.post(`${org(organization)}/iso`, file, {
        contentType: 'octet-stream',
        headers: { 'x-file-name': file.name, 'x-is-public': String(isPublic) },
        onUploadProgress,
      }),
    remove: (organization, isoId) => client.delete(iso(organization, isoId)),
    removeAll: organization => client.delete(`${org(organization)}/iso`),
    downloadLink: (organization, isoId) =>
      client.post(`${iso(organization, isoId)}/download-link`, {}).then(data => data.downloadUrl),
    update: (organization, isoId, body) => client.put(iso(organization, isoId), body),
    watch: (organization, isoId) => client.post(`${iso(organization, isoId)}/watch`, {}),
    unwatch: (organization, isoId) => client.delete(`${iso(organization, isoId)}/watch`),
    watches: () => client.get('/api/user/iso-watches'),
  },
  organizations: {
    withUsers: () => client.get('/api/organizations-with-users'),
    users: organization => client.get(`${org(organization)}/users`),
    get: organization => client.get(org(organization)),
    update: (organization, body) => client.put(org(organization), body),
    suspend: organization => client.put(`${org(organization)}/suspend`, {}),
    resume: organization => client.put(`${org(organization)}/resume`, {}),
    remove: organization => client.delete(org(organization)),
    discover: () => client.get('/api/organizations/discover'),
    accessMode: (organization, accessMode, defaultRole) =>
      client.put(`${org(organization)}/access-mode`, { accessMode, defaultRole }),
    memberRole: (organization, userId, role) =>
      client.put(`${org(organization)}${encodePath('users', userId)}/role`, { role }),
    removeMember: (organization, userId) =>
      client.delete(`${org(organization)}${encodePath('members', userId)}`),
    joinAsAdmin: organization => client.post(`${org(organization)}/join`, {}),
  },
  users: {
    publicContent: lang => client.get('/api/users/all', { ...PUBLIC, params: { lang } }),
    remove: userId => client.delete(user(userId)),
    suspend: userId => client.put(`${user(userId)}/suspend`, {}),
    resume: userId => client.put(`${user(userId)}/resume`, {}),
    changePassword: (userId, newPassword, signal) =>
      client.put(`${user(userId)}/change-password`, { newPassword }, { signal }),
    changeEmail: (userId, newEmail, signal) =>
      client.put(`${user(userId)}/change-email`, { newEmail }, { signal }),
    changeName: (userId, name, signal) =>
      client.put(`${user(userId)}/change-name`, { name }, { signal }),
    organizations: () => client.get('/api/user/organizations'),
    leave: organization => client.post(encodePath('api', 'user', 'leave', organization), {}),
    setPrimary: organization =>
      client.put(encodePath('api', 'user', 'primary-organization', organization), {}),
  },
  requests: {
    create: (organization, message = null) =>
      client.post(`${org(organization)}/requests`, { message }),
    mine: () => client.get('/api/user/requests'),
    cancel: requestId => client.delete(encodePath('api', 'user', 'requests', requestId)),
    forOrg: organization => client.get(`${org(organization)}/requests`),
    approve: (organization, requestId, assignedRole = 'member') =>
      client.post(`${org(organization)}${encodePath('requests', requestId)}/approve`, {
        assignedRole,
      }),
    deny: (organization, requestId) =>
      client.post(`${org(organization)}${encodePath('requests', requestId)}/deny`, {}),
  },
  invitations: {
    active: organization => client.get(encodePath('api', 'invitations', 'active', organization)),
    remove: invitationId => client.delete(encodePath('api', 'invitations', invitationId)),
  },
  serviceAccounts: {
    create: (description, expirationDays, organizationId) =>
      client.post('/api/service-accounts/', { description, expirationDays, organizationId }),
    organizations: () => client.get('/api/service-accounts/organizations'),
    list: signal => client.get('/api/service-accounts/', { signal }),
    remove: id => client.delete(encodePath('api', 'service-accounts', id)),
  },
  config: {
    get: configName => client.get(encodePath('api', 'config', configName)),
    update: (configName, configData) =>
      client.put(encodePath('api', 'config', configName), configData),
    restart: () => client.post('/api/config/restart', {}),
    testSmtp: email => client.post('/api/mail/test-smtp', { testEmail: email }),
    ticket: () => client.get('/api/config/ticket', PUBLIC),
    hyperweaver: () => client.get('/api/config/hyperweaver', PUBLIC),
    uploadSsl: (file, targetPath) =>
      client.post('/api/config/ssl/upload', file, {
        params: { targetPath },
        contentType: 'octet-stream',
      }),
  },
  system: {
    health: () => client.get('/api/health', PUBLIC),
    storage: () => client.get('/api/system/storage'),
    updateStatus: () => client.get('/api/system/update-check'),
  },
  favorites: {
    get: () => client.get('/api/favorites'),
    save: favorites => client.post('/api/favorites/save', favorites),
  },
  setup: {
    verifyToken: token => client.post('/api/setup/verify-token', { token }, PUBLIC),
    configs: token => client.get('/api/setup', setupAuth(token)),
    update: (token, configs) => client.put('/api/setup', { configs }, setupAuth(token)),
    status: () => client.get('/api/setup/status', PUBLIC),
    uploadSsl: uploadSslForm,
  },
};
