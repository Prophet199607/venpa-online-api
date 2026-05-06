
exports.payhereNotify = async (req, res) => {
  console.log("--- PayHere Notify Callback ---");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Query:", req.query);
  console.log("-------------------------------");
  
  // PayHere expects a 200 OK response
  res.status(200).send("OK");
};

exports.payhereReturn = async (req, res) => {
  console.log("--- PayHere Return Callback ---");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Query:", req.query);
  console.log("-------------------------------");
  
  res.status(200).json({
    message: "Payment successful redirect received",
    data: req.body
  });
};

exports.payhereCancel = async (req, res) => {
  console.log("--- PayHere Cancel Callback ---");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Query:", req.query);
  console.log("-------------------------------");
  
  res.status(200).json({
    message: "Payment cancellation redirect received",
    data: req.body
  });
};
