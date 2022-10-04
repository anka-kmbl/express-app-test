function buildPaidJobsTotalByContractQuery (start, end, limit = 1) {
  const totalPriceByContractQuery = `SELECT
    Contracts.ClientId AS clientId,
    Contracts.ContractorId,
    Contracts.id,
    SUM(Jobs.price) AS paid
    FROM Contracts
    INNER JOIN Jobs
    ON Contracts.id = Jobs.ContractId
    WHERE Jobs.paid = 1 AND Jobs.paymentDate BETWEEN '${start}' AND '${end}'
    GROUP BY Contracts.id`
  return `SELECT
    t.clientId,
    t.paid,
    SUM(t.paid) AS totalPriceByClient
    FROM (${totalPriceByContractQuery}) AS t
    GROUP BY t.clientId
    ORDER BY paid DESC
    LIMIT ${limit}`
}
function getMostPaidClientsQuery (t) {
  return `SELECT
    paidJobs.clientId AS 'id',
    (Profiles.firstName || ' ' || Profiles.lastName) AS 'fullName',
    paidJobs.paid AS 'paid'
    FROM Profiles
    INNER JOIN (${t}) AS paidJobs
    ON Profiles.id = paidJobs.clientId`
}
module.exports = { buildPaidJobsTotalByContractQuery, getMostPaidClientsQuery }
