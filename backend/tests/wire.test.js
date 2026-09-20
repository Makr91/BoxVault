import db from '../app/models/index.js';
import { snakeKeys } from '../app/utils/wire.js';

describe('snakeKeys', () => {
  it('converts the keys of a nested object', () => {
    const input = { fooBar: { bazQux: 1, plain: 2 } };
    expect(snakeKeys(input)).toEqual({ foo_bar: { baz_qux: 1, plain: 2 } });
  });

  it('converts the keys of every object inside an array', () => {
    const input = [{ oneTwo: 1 }, { threeFour: 2 }];
    expect(snakeKeys(input)).toEqual([{ one_two: 1 }, { three_four: 2 }]);
  });

  it('passes a Date through untouched', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    expect(snakeKeys({ createdAt: date })).toEqual({ created_at: date });
    expect(snakeKeys(date)).toBe(date);
  });

  it('passes null through untouched', () => {
    expect(snakeKeys(null)).toBeNull();
    expect(snakeKeys({ deletedAt: null })).toEqual({ deleted_at: null });
  });

  it('leaves a key already in snake_case unchanged', () => {
    expect(snakeKeys({ org_code: 'A55D94' })).toEqual({ org_code: 'A55D94' });
  });

  it('converts a camelCase key that carries a digit', () => {
    expect(snakeKeys({ addressLine1: '123 Main St' })).toEqual({ address_line1: '123 Main St' });
  });
});

describe('Shared model toJSON', () => {
  const uniqueId = Date.now().toString(36);
  let organization;

  beforeAll(async () => {
    organization = await db.organization.create({
      name: `WireOrg_${uniqueId}`,
      description: 'An org for wire tests',
    });
  });

  afterAll(async () => {
    await db.organization.destroy({ where: { id: organization.id } });
  });

  it('drops storage_path from an iso_files row and snake_cases the rest', async () => {
    const iso = await db.iso.create({
      name: `wire-iso-${uniqueId}`,
      organizationId: organization.id,
    });
    const version = await db.isoVersions.create({ versionNumber: '1.0.0', isoId: iso.id });
    const file = await db.isoFiles.create({
      architecture: 'amd64',
      fileName: 'wire.iso',
      fileSize: 1024,
      checksum: 'abc123',
      checksumType: 'SHA256',
      storagePath: `${organization.id}/abc123.iso`,
      isoVersionId: version.id,
    });

    const json = file.toJSON();

    expect(json.storage_path).toBeUndefined();
    expect(json.file_name).toBe('wire.iso');
    expect(Number(json.file_size)).toBe(1024);
    expect(json.checksum_type).toBe('SHA256');
    expect(json.download_count).toBe(0);
    expect(json.iso_version_id).toBe(version.id);
    expect(json.created_at).toBeInstanceOf(Date);
    expect(json.updated_at).toBeInstanceOf(Date);

    await iso.destroy();
  });

  it('drops storage_path, original and links_to from a download_files row and snake_cases the rest', async () => {
    const download = await db.download.create({
      name: `wire-download-${uniqueId}`,
      organizationId: organization.id,
    });
    const release = await db.downloadReleases.create({
      versionNumber: '1.0.0',
      downloadId: download.id,
    });
    const patch = await db.downloadPatches.create({
      name: 'base',
      downloadReleaseId: release.id,
    });
    const file = await db.downloadFiles.create({
      key: 'wire-file',
      fileName: 'wire.zip',
      fileSize: 2048,
      checksum: 'def456',
      checksumType: 'SHA256',
      storagePath: `${organization.id}/def456.zip`,
      original: true,
      downloadPatchId: patch.id,
    });

    const json = file.toJSON();

    expect(json.storage_path).toBeUndefined();
    expect(json.original).toBeUndefined();
    expect(json.links_to).toBeUndefined();
    expect(json.file_name).toBe('wire.zip');
    expect(Number(json.file_size)).toBe(2048);
    expect(json.checksum_type).toBe('SHA256');
    expect(json.download_count).toBe(0);
    expect(json.download_patch_id).toBe(patch.id);
    expect(json.created_at).toBeInstanceOf(Date);
    expect(json.updated_at).toBeInstanceOf(Date);

    await download.destroy();
  });
});
