const { KubeConfig, AppsV1Api, CoreV1Api } = require('@kubernetes/client-node');
const kc = new KubeConfig();
kc.loadFromCluster();

const k8sAppsApi = kc.makeApiClient(AppsV1Api);
const k8sCoreApi = kc.makeApiClient(CoreV1Api);

const { get } = require('./config');

const createDeploymentForTeam = ({ team }) =>
  k8sAppsApi
    .createNamespacedDeployment(get('namespace'), {
      metadata: {
        name: `t-${team}-juiceshop`,
        labels: {
          app: 'juice-shop',
          team,
          'deployment-context': get('deploymentContext'),
        },
      },
      spec: {
        selector: {
          matchLabels: {
            app: 'juice-shop',
            team,
            'deployment-context': get('deploymentContext'),
          },
        },
        template: {
          metadata: {
            labels: {
              app: 'juice-shop',
              team,
              'deployment-context': get('deploymentContext'),
            },
          },
          spec: {
            automountServiceAccountToken: false,
            containers: [
              {
                name: 'juice-shop',
                image: `${get('juiceShop.image')}:${get('juiceShop.tag')}`,
                imagePullPolicy: get('juiceShop.imagePullPolicy'),
                resources: get('juiceShop.resources'),
                env: [
                  {
                    name: 'NODE_ENV',
                    value: get('juiceShop.nodeEnv'),
                  },
                  {
                    name: 'CTF_KEY',
                    value: get('juiceShop.ctfKey'),
                  },
                ],
                ports: [
                  {
                    containerPort: 3000,
                  },
                ],
                readinessProbe: {
                  httpGet: {
                    path: '/rest/admin/application-version',
                    port: 3000,
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 2,
                  failureThreshold: 10,
                },
                livenessProbe: {
                  httpGet: {
                    path: '/rest/admin/application-version',
                    port: 3000,
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 15,
                },
                volumeMounts: [
                  {
                    name: 'juice-shop-config',
                    mountPath: '/juice-shop/config/juicy-ctf.yaml',
                    subPath: 'juicy-ctf.yaml',
                  },
                ],
              },
              {
                name: 'progress-watchdog',
                image: 'iteratec/juice-progress-watchdog',
                env: [
                  {
                    name: 'REDIS_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'juicy-ctf-redis',
                        key: 'redis-password',
                      },
                    },
                  },
                  {
                    name: 'REDIS_HOST',
                    value: get('redis.host'),
                  },
                  {
                    name: 'REDIS_PORT',
                    value: `${get('redis.port')}`,
                  },
                  {
                    name: 'TEAMNAME',
                    value: team,
                  },
                ],
              },
            ],
            volumes: [
              {
                name: 'juice-shop-config',
                configMap: {
                  name: 'juice-shop-config',
                },
              },
            ],
          },
        },
      },
    })
    .catch(error => {
      throw new Error(error.response.body.message);
    });

module.exports.createDeploymentForTeam = createDeploymentForTeam;

const createServiceForTeam = teamname =>
  k8sCoreApi
    .createNamespacedService(get('namespace'), {
      metadata: {
        name: `t-${teamname}-juiceshop`,
        labels: {
          app: 'juice-shop',
          team: teamname,
          'deployment-context': get('deploymentContext'),
        },
      },
      spec: {
        selector: {
          app: 'juice-shop',
          team: teamname,
          'deployment-context': get('deploymentContext'),
        },
        ports: [
          {
            port: 3000,
          },
        ],
      },
    })
    .catch(error => {
      throw new Error(error.response.body.message);
    });
module.exports.createServiceForTeam = createServiceForTeam;

const getJuiceShopInstances = () =>
  k8sAppsApi
    .listNamespacedDeployment(
      get('namespace'),
      true,
      undefined,
      undefined,
      undefined,
      `app=juice-shop,deployment-context=${get('deploymentContext')}`
    )
    .catch(error => {
      throw new Error(error.response.body.message);
    });
module.exports.getJuiceShopInstances = getJuiceShopInstances;

const deletePodForTeam = async team => {
  const res = await k8sCoreApi.listNamespacedPod(
    get('namespace'),
    true,
    undefined,
    undefined,
    undefined,
    `app=juice-shop,team=${team},deployment-context=${get('deploymentContext')}`
  );

  const pods = res.body.items;

  if (pods.length !== 1) {
    throw new Error(`Unexpected number of pods ${pods.length}`);
  }

  const podname = pods[0].metadata.name;

  await k8sCoreApi.deleteNamespacedPod(podname, get('namespace'));
};
module.exports.deletePodForTeam = deletePodForTeam;

const getJuiceShopInstanceForTeamname = teamname =>
  k8sAppsApi
    .readNamespacedDeployment(`t-${teamname}-juiceshop`, get('namespace'))
    .then(res => {
      return {
        readyReplicas: res.body.status.readyReplicas,
        availableReplicas: res.body.status.availableReplicas,
      };
    })
    .catch(error => {
      throw new Error(error.response.body.message);
    });
module.exports.getJuiceShopInstanceForTeamname = getJuiceShopInstanceForTeamname;
