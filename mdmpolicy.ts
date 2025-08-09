// /oauth/token (client_credentials with private_key_jwt)
app.post("/oauth/token", express.urlencoded({ extended: false }), async (req, res) => {
  const { grant_type, client_assertion_type, client_assertion, scope } = req.body;
  if (grant_type !== "client_credentials") return res.status(400).send("unsupported_grant_type");
  if (client_assertion_type !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
    return res.status(400).send("invalid_client");

  // Verify client_assertion using the registered client's JWKS
  const client = await lookupClientByIss(/* from JWT iss */);
  const JWKS = createRemoteJWKSet(new URL(client.jwks_uri));
  const { payload } = await jwtVerify(client_assertion, JWKS, {
    audience: "https://omnigate/token",
    issuer: client.client_id,
    subject: client.client_id,
  });

  // Issue SHORT-LIVED internal PoP token bound to client key/cert thumbprint
  const cnf = payload.cnf || {}; // prefer carrying over cnf.x5t#S256 if present
  const internal = await new SignJWT({ scope, cnf, client_id: client.client_id })
    .setProtectedHeader({ alg: "RS256", kid: MY_KID })
    .setIssuer("https://omnigate")
    .setAudience("snowflake-proxy")
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(MY_RSA_PRIVATE_KEY);

  res.json({ access_token: internal, token_type: "Bearer", expires_in: 600 });
});
