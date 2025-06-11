import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { createRailwayApi, type RailwayApi } from "../../src/railway/api.ts";
import { Database } from "../../src/railway/database.ts";
import { Environment } from "../../src/railway/environment.ts";
import { Project } from "../../src/railway/project.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

// GraphQL queries for tests
const GET_DATABASE_QUERY = `
  query Database($id: String!) {
    database(id: $id) {
      id
      name
      projectId
      environmentId
      type
    }
  }
`;

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Database Resource", () => {
  const testProjectId = `${BRANCH_PREFIX}-db-project`;
  const testEnvironmentId = `${BRANCH_PREFIX}-db-environment`;
  const testDatabaseId = `${BRANCH_PREFIX}-database`;

  test.skipIf(!!process.env.CI)("create and delete database", async (scope) => {
    const railwayToken = import.meta.env.RAILWAY_TOKEN;
    if (!railwayToken) {
      throw new Error("RAILWAY_TOKEN environment variable is required");
    }
    const api = createRailwayApi({ apiKey: railwayToken });
    let project: Project | undefined;
    let environment: Environment | undefined;
    let database: Database | undefined;

    try {
      project = await Project(testProjectId, {
        name: `${BRANCH_PREFIX} Database Test Project`,
        description: "A project for testing databases",
      });

      environment = await Environment(testEnvironmentId, {
        name: "test",
        project: project,
      });

      database = await Database(testDatabaseId, {
        name: "test-postgres",
        project: project,
        environment: environment,
        type: "postgresql",
      });

      expect(database.id).toBeTruthy();
      expect(database).toMatchObject({
        name: "test-postgres",
        projectId: project.id,
        environmentId: environment.id,
        type: "postgresql",
      });
      expect(database.connectionString.unencrypted).toBeTruthy();
      expect(database.password.unencrypted).toBeTruthy();

      const response = await api.query(GET_DATABASE_QUERY, { id: database.id });

      const railwayDatabase = response.data?.database;
      expect(railwayDatabase).toMatchObject({
        id: database.id,
        name: "test-postgres",
        projectId: project.id,
        environmentId: environment.id,
        type: "postgresql",
      });
    } catch (err) {
      console.log(err);
      throw err;
    } finally {
      await destroy(scope);

      if (database?.id) {
        await assertDatabaseDeleted(database.id, api);
      }
    }
  });
});

async function assertDatabaseDeleted(databaseId: string, api: RailwayApi) {
  try {
    const response = await api.query(GET_DATABASE_QUERY, { id: databaseId });

    expect(response.data?.database).toBeNull();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return;
    }
    throw error;
  }
}
