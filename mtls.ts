// When you run HTTPS server: request client certs and verify
const httpsServer = https.createServer({
  key: TLS_KEY,
  cert: TLS_CERT,
  ca: CLIENT_CA_BUNDLE,      // the CA that issued client certs
  requestCert: true,
  rejectUnauthorized: true,  // enforce mTLS
}, app);

// In your /query handler, bind/verify the cert thumbprint:
const peer = (req.socket as any).getPeerCertificate?.();
const x5t = peer?.raw ? createHash("sha256").update(peer.raw).digest("base64url") : undefined;

const { payload } = await jwtVerify(internalToken, MY_JWKS, { audience: "snowflake-proxy", issuer: "https://omnigate" });
// If `cnf.x5t#S256` is present, require it to match the presented cert:
if (payload.cnf?.["x5t#S256"] && payload.cnf["x5t#S256"] !== x5t) {
  return res.status(401).send("sender_constrained_mismatch");
}
