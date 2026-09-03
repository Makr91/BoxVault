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
import { IsoItemActions, IsoListActions } from './components/IsoSlots.component';
import {
  architectureNames,
  architecturesColumn,
  checksumColumn,
  createdColumn,
  downloadsColumn,
  nameColumn,
  osColumn,
  providerNames,
  providersColumn,
  releasedColumn,
  sizeColumn,
  statusColumn,
  updatedColumn,
  versionsColumn,
  visibilityColumn,
} from './pages';
import { canManageBox } from './utils/permissions';

const sharedColumns = [nameColumn, visibilityColumn, createdColumn, updatedColumn, downloadsColumn];

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
      labelKey: 'pages.filter.provider',
      values: providerNames,
      activeClass: 'bg-primary',
    },
    {
      key: 'architecture',
      labelKey: 'pages.filter.architecture',
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
    ...sharedColumns,
    statusColumn,
    osColumn,
    releasedColumn,
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

export const isos = {
  key: 'isos',
  labelKey: 'collections.isos',
  icon: <FaCompactDisc aria-hidden />,
  segment: 'isos',
  hasVersions: false,
  itemRoute: true,
  searchKey: 'search.isos',
  defaultView: 'table',
  adapter: isosAdapter,
  filterGroups: [
    {
      key: 'organization',
      labelKey: 'pages.table.organization',
      values: item => [item.organization.name],
      activeClass: 'bg-primary',
      homeOnly: true,
    },
  ],
  columns: [...sharedColumns, sizeColumn, checksumColumn],
  slots: { ListActions: IsoListActions, ItemActions: IsoItemActions },
};

export const collections = [boxes, isos];
