import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { createRailwayApi, type RailwayApi } from "../../src/railway/api.ts";
import { CustomDomain } from "../../src/railway/custom-domain.ts";
import { Environment } from "../../src/railway/environment.ts";
import { Project } from "../../src/railway/project.ts";
import { Service } from "../../src/railway/service.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

// GraphQL queries for tests
const GET_CUSTOM_DOMAIN_QUERY = `
  query CustomDomain($id: String!) {
    customDomain(id: $id) {
      id
      domain
      serviceId
      environmentId
      status
    }
  }
`;

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("CustomDomain Resource", () => {
  const testProjectId = `${BRANCH_PREFIX}-domain-project`;
  const testEnvironmentId = `${BRANCH_PREFIX}-domain-environment`;
  const testServiceId = `${BRANCH_PREFIX}-domain-service`;
  const testDomainId = `${BRANCH_PREFIX}-custom-domain`;

  test.skipIf(!!process.env.CI)(
    "create and delete custom domain",
    async (scope) => {
      const railwayToken = import.meta.env.RAILWAY_TOKEN;
      if (!railwayToken) {
        throw new Error("RAILWAY_TOKEN environment variable is required");
      }
      const api = createRailwayApi({ apiKey: railwayToken });
      let project: Project | undefined;
      let environment: Environment | undefined;
      let service: Service | undefined;
      let customDomain: CustomDomain | undefined;

      try {
        project = await Project(testProjectId, {
          name: `${BRANCH_PREFIX} Custom Domain Test Project`,
          description: "A project for testing custom domains",
        });

        environment = await Environment(testEnvironmentId, {
          name: "test",
          project: project,
        });

        service = await Service(testServiceId, {
          name: "web-service",
          project: project,
        });

        customDomain = await CustomDomain(testDomainId, {
          domain: `${BRANCH_PREFIX}-test.example.com`,
          service: service,
          environment: environment,
        });

        expect(customDomain.id).toBeTruthy();
        expect(customDomain).toMatchObject({
          domain: `${BRANCH_PREFIX}-test.example.com`,
          serviceId: service.id,
          environmentId: environment.id,
        });
        expect(customDomain.status).toBeTruthy();

        const response = await api.query(GET_CUSTOM_DOMAIN_QUERY, { id: customDomain.id });

        const railwayCustomDomain = response.data?.customDomain;
        expect(railwayCustomDomain).toMatchObject({
          id: customDomain.id,
          domain: `${BRANCH_PREFIX}-test.example.com`,
          serviceId: service.id,
          environmentId: environment.id,
        });
      } catch (err) {
        console.log(err);
        throw err;
      } finally {
        await destroy(scope);

        if (customDomain?.id) {
          await assertCustomDomainDeleted(customDomain.id, api);
        }
      }
    },
  );
});

async function assertCustomDomainDeleted(customDomainId: string, api: RailwayApi) {
  try {
    const response = await api.query(GET_CUSTOM_DOMAIN_QUERY, { id: customDomainId });

    expect(response.data?.customDomain).toBeNull();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return;
    }
    throw error;
  }
}
