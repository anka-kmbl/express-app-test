/* eslint-disable no-return-assign */
const express = require('express')
const bodyParser = require('body-parser')
const { sequelize, Contract, Job, Profile } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { Op } = require('sequelize')
const { buildPaidJobsTotalByContractQuery, getMostPaidClientsQuery } = require('./utils')
const app = express()
app.use(bodyParser.json())
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
  const { id } = req.params
  const contract = await Contract.findOne({
    where: { id, ContractorId: req.profile.id }
  })
  if (!contract) return res.status(404).end()
  res.json(contract)
})

/**
 * @returns non-terminated contracts
 */
app.get('/contracts', getProfile, async (req, res) => {
  const nonTerminatedContracts = await Contract.findAll({
    where: {
      status: { [Op.ne]: 'terminated' }
    }
  })
  if (!nonTerminatedContracts) return res.status(404).end()
  return res.json(nonTerminatedContracts)
})

/**
 * @returns unpaid jobs for a client/contractor for active contracts only
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
  const unpaidJobs = await Contract.findAll({
    where: { status: 'in_progress' },
    include: {
      model: Job,
      where: {
        paid: { [Op.not]: true }
      }
    }
  })
  if (!unpaidJobs) return res.status(404).end()
  return res.json(unpaidJobs)
})

/**
 * @returns job payment query
 */
app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
  const job = await Job.findOne({
    where: { id: req.params.job_id || 1 }
  })
  if (!job) return res.status(404).end()
  console.log(job)
  if (req.profile.balance < job.price) {
    return res.status(400).send('Not enough balance')
  }
  const transaction = await sequelize.transaction()
  try {
    req.profile.balance -= job.price
    await req.profile.save({ transaction })

    job.paid = true
    job.paymentDate = new Date()
    await job.save({ transaction })

    await transaction.commit()
  } catch (error) {
    await transaction.rollback()
    res.status(500).send('Transaction failed. Try again later')
  }
  return res.json('Congrats! The job is successfully paid')
})

/**
 * performs depositing
 */
app.post('/balances/deposit/:userId', async (req, res) => {
  try {
    const clientProfile = await Profile.findOne({
      where: { type: 'client', id: req.params.userId },
      include: [{ all: true, nested: true }]
    })
    const deposit = req.body.deposit || 0
    if (!clientProfile || !clientProfile.Client) return res.status(404).end()

    const totalJobPrice = clientProfile.Client.reduce((sum, curr) => {
      const priceSum = curr.Jobs
        ? curr.Jobs.reduce((acc, curr) => {
          return acc += !curr.paid ? curr.price : 0
        }, 0)
        : 0
      return sum += priceSum
    }, 0)
    if (deposit > totalJobPrice * 0.25) {
      return res.status(404).send('You can not deposit more than 25% of the total job price')
    }
    clientProfile.balance += deposit
    await clientProfile.save()
    return res.send('Success')
  } catch (err) {
    return res.status(500).send(err)
  }
})

/**
 * /admin/best-profession?start=<date>&end=<date>
 * @returns profession <string> that earned most money
 */
app.get('/admin/best-profession', async (req, res) => {
  try {
    const { start = '1970-01-01', end = new Date().toISOString().slice(0, 10) } = req.query
    const paidJobsSumByContractQuery = buildPaidJobsTotalByContractQuery(start, end)
    const paidJobsSumByContract = await sequelize.query(paidJobsSumByContractQuery)
    const highestPaidJobsClientId = paidJobsSumByContract ? paidJobsSumByContract[0][0]?.clientId : null
    if (!highestPaidJobsClientId) return res.status(404).end()

    const clientProfile = await Profile.findOne({
      attributes: ['profession'],
      where: { id: highestPaidJobsClientId }
    })
    if (!clientProfile) return res.status(404).end()

    return res.send(clientProfile.profession)
  } catch (err) {
    return res.status(500).send(err)
  }
})

/**
 * /admin/best-clients?start=<date>&end=<date>&limit=<integer>
 * @returns array of the clients that aid the most for jobs in the query time period
 */
app.get('/admin/best-clients', async (req, res) => {
  try {
    const { start = '1970-01-01', end = new Date().toISOString().slice(0, 10), limit = 2 } = req.query
    const paidJobsSumByContractQuery = buildPaidJobsTotalByContractQuery(start, end, limit)

    const mostPaidClientsQuery = getMostPaidClientsQuery(paidJobsSumByContractQuery)
    const mostPaidClients = await sequelize.query(mostPaidClientsQuery)

    if (!mostPaidClients) return res.status(404).end()
    return res.json(mostPaidClients[0])
  } catch (err) {
    return res.status(500).send(err)
  }
})
module.exports = app
