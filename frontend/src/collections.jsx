import { FaCompactDisc, FaCube } from 'react-icons/fa6';

import { boxesAdapter, isosAdapter } from './boxvaultAdapter';
import {
  BoxCicdBar,
  BoxItemActions,
  BoxItemExtras,
  BoxVersionRowActions,
  BoxVersionsActions,
} from './components/BoxItemSlots.component';
import { BoxListActions } from './components/BoxListSlots.component';
import {
  BoxArchitectureRowActions,
  BoxArchitecturesActions,
  BoxProviderActions,
} from './components/BoxProviderSlots.component';
import {
  BoxProviderRowActions,
  BoxProvidersActions,
  BoxVersionActions,
  BoxVersionBannerActions,
  BoxVersionNotesActions,
} from './components/BoxVersionSlots.component';
import { IsoListActions, IsoRowActions } from './components/IsoSlots.component';
import {
  architectureNames,
  architecturesColumn,
  checksumColumn,
  createdColumn,
  downloadsColumn,
  nameColumn,
  organizationColumn,
  osColumn,
  providerNames,
  providersColumn,
  releasedColumn,
  sizeColumn,
  statusColumn,
  uploadedColumn,
  versionsColumn,
  visibilityColumn,
} from './pages';
import { canManageBox } from './utils/permissions';

export const boxes = {
  key: 'boxes',
  labelKey: 'collections.boxes',
  icon: <FaCube aria-hidden />,
  segment: '',
  hasVersions: true,
  itemRoute: true,
  searchKey: 'search.boxes',
  defaultView: 'table',
  adapter: boxesAdapter,
  canManage: (item, user) => canManageBox(user, item.organization.name, item.extras.raw),
  filterGroups: [
    {
      key: 'watched',
      labelKey: 'pages.watch.filterWatched',
      values: (item, ctx) => (ctx.watchedIds.has(item.id) ? ['watched'] : []),
      activeClass: 'bg-warning text-dark',
      labelFor: (value, t) => t(`pages.watch.${value}`),
      signedInOnly: true,
    },
    {
      key: 'provider',
      labelKey: 'pages.table.providers',
      values: providerNames,
      activeClass: 'bg-primary',
    },
    {
      key: 'architecture',
      labelKey: 'pages.table.architectures',
      values: architectureNames,
      activeClass: 'bg-info',
    },
    {
      key: 'os',
      labelKey: 'pages.table.os',
      values: item => (item.metadata?.distro ? [item.metadata.distro] : []),
      activeClass: 'bg-success',
    },
  ],
  columns: [
    nameColumn,
    osColumn,
    statusColumn,
    { ...visibilityColumn, labelKey: 'pages.table.public' },
    createdColumn,
    releasedColumn,
    downloadsColumn,
    versionsColumn,
    providersColumn,
    architecturesColumn,
  ],
  slots: {
    ListActions: BoxListActions,
    ItemActions: BoxItemActions,
    ItemHeaderExtra: BoxCicdBar,
    ItemExtras: BoxItemExtras,
    VersionsActions: BoxVersionsActions,
    VersionRowActions: BoxVersionRowActions,
    VersionActions: BoxVersionActions,
    VersionBannerActions: BoxVersionBannerActions,
    VersionNotesActions: BoxVersionNotesActions,
    ProvidersActions: BoxProvidersActions,
    ProviderRowActions: BoxProviderRowActions,
    ProviderActions: BoxProviderActions,
    ArchitecturesActions: BoxArchitecturesActions,
    ArchitectureRowActions: BoxArchitectureRowActions,
  },
};

const isoNameColumn = {
  key: 'name',
  labelKey: 'pages.table.name',
  sortValue: item => item.name.toLowerCase(),
  render: item => item.name,
};

export const isos = {
  key: 'isos',
  labelKey: 'collections.isos',
  icon: <FaCompactDisc aria-hidden />,
  segment: 'isos',
  hasVersions: false,
  itemRoute: false,
  searchKey: 'search.isos',
  defaultView: 'table',
  adapter: isosAdapter,
  filterGroups: [
    {
      key: 'visibility',
      labelKey: 'pages.table.visibility',
      values: item => [item.isPublic ? 'public' : 'private'],
      activeClass: 'bg-info',
      labelFor: (value, t) => t(`pages.status.${value}`),
      orgOnly: true,
    },
    {
      key: 'organization',
      labelKey: 'pages.table.organization',
      values: item => [item.organization.name],
      activeClass: 'bg-primary',
      homeOnly: true,
    },
  ],
  columns: [
    isoNameColumn,
    { ...visibilityColumn, when: ctx => Boolean(ctx.org) },
    { ...organizationColumn, when: ctx => !ctx.org },
    sizeColumn,
    checksumColumn,
    uploadedColumn,
  ],
  slots: { ListActions: IsoListActions, RowActions: IsoRowActions },
};

export const collections = [boxes, isos];
