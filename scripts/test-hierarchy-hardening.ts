import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function testStorageHierarchyGuards(): void {
  const storagePath = path.resolve(process.cwd(), 'server/storage.ts');
  const storageContent = readFileSync(storagePath, 'utf8');

  assert.equal(storageContent.includes('class HierarchyValidationError extends Error'), true);
  assert.equal(storageContent.includes('Only admins can modify hierarchy'), true);
  assert.equal(storageContent.includes('Agents cannot be assigned as their own upline'), true);
  assert.equal(storageContent.includes('Hierarchy update would create a circular reporting chain'), true);
  assert.equal(storageContent.includes('Cannot assign an inactive user as upline'), true);
  assert.equal(storageContent.includes('Failed to record hierarchy history'), true);
}

function testStorageDiagnosticsExported(): void {
  const storagePath = path.resolve(process.cwd(), 'server/storage.ts');
  const storageContent = readFileSync(storagePath, 'utf8');

  assert.equal(/export async function getAgentHierarchyHealthDiagnostics\(/.test(storageContent), true);
  assert.equal(/getAgentHierarchyHealthDiagnostics,/.test(storageContent), true);
}

function testAdminHierarchyRoutes(): void {
  const routePath = path.resolve(process.cwd(), 'server/routes/admin-hierarchy.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  assert.equal(routeContent.includes("/api/admin/agents/hierarchy/health"), true);
  assert.equal(routeContent.includes('const statusCode = Number(error?.statusCode) || 500;'), true);
}

function testCreateUserHierarchyWarningSurface(): void {
  const authPath = path.resolve(process.cwd(), 'server/routes/supabase-auth.ts');
  const authContent = readFileSync(authPath, 'utf8');

  assert.equal(authContent.includes('let hierarchyWarning: string | null = null;'), true);
  assert.equal(authContent.includes("warnings: hierarchyWarning ? [{ field: 'hierarchy', message: hierarchyWarning }] : []"), true);
}

function run(): void {
  testStorageHierarchyGuards();
  testStorageDiagnosticsExported();
  testAdminHierarchyRoutes();
  testCreateUserHierarchyWarningSurface();
  console.log('Hierarchy hardening tests passed');
}

run();
