/**
 * Distributed Tracing — OpenTelemetry + Jaeger
 *
 * MUST be required FIRST before any other module.
 * Only active when OTEL_ENABLED=true.
 */

'use strict';

(function initTracing() {
  if (process.env.OTEL_ENABLED !== 'true') {
    return; // no-op — skip all overhead when tracing is disabled
  }

  const { NodeSDK }                    = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter }          = require('@opentelemetry/exporter-otlp-http');
  // v2.x exports resourceFromAttributes, not a Resource class constructor
  const { resourceFromAttributes }     = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:    process.env.OTEL_SERVICE_NAME || 'benchmark-backend',
      [ATTR_SERVICE_VERSION]: '3.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    }),

    traceExporter: exporter,

    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable FS — creates thousands of noisy spans for log/temp file writes
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // Skip health checks and Prometheus scrapes — not useful in traces
          ignoreIncomingRequestHook: (req) =>
            req.url === '/health' || req.url === '/metrics',
        },
      }),
    ],
  });

  sdk.start();
  console.log(
    '[Tracing] OpenTelemetry SDK started →',
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318'
  );

  // Flush pending spans before process exits
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[Tracing] SDK shut down cleanly'))
      .catch((err) => console.error('[Tracing] Shutdown error', err))
      .finally(() => process.exit(0));
  });
}());
