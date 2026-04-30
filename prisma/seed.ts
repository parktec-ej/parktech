import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const OPERATION_MODE_RESERVATION_THEN_HOURLY =
  'RESERVATION_THEN_HOURLY' as const

const PRICING_TYPE_RESERVATION_FIXED =
  'RESERVATION_FIXED' as const

const PRICING_TYPE_HOURLY =
  'HOURLY' as const

const ROUNDING_TYPE_CEIL_HOUR =
  'CEIL_HOUR' as const

async function main() {
  const place = await prisma.place.upsert({
    where: { slug: 'rifu-main' },
    update: {
      name: 'ParkTech 利府メイン駐車場',
      address: '宮城県宮城郡利府町',
      operationMode: OPERATION_MODE_RESERVATION_THEN_HOURLY,
      isActive: true,
    },
    create: {
      slug: 'rifu-main',
      name: 'ParkTech 利府メイン駐車場',
      address: '宮城県宮城郡利府町',
      operationMode: OPERATION_MODE_RESERVATION_THEN_HOURLY,
      isActive: true,
      updatedAt: new Date(),
    },
  })

  const spots = [
    { code: 'A-01', label: 'A-01' },
    { code: 'A-02', label: 'A-02' },
    { code: 'A-03', label: 'A-03' },
    { code: 'A-04', label: 'A-04' },
    { code: 'A-05', label: 'A-05' },
  ]

  for (const spot of spots) {
    await prisma.spot.upsert({
      where: {
        placeId_code: {
          placeId: place.id,
          code: spot.code,
        },
      },
      update: {
        label: spot.label,
        isActive: true,
      },
      create: {
        placeId: place.id,
        code: spot.code,
        label: spot.label,
        isActive: true,
      },
    })
  }

  await prisma.pricingRule.upsert({
    where: { id: 'rifu-reservation-fixed-rule' },
    update: {
      placeId: place.id,
      pricingType: PRICING_TYPE_RESERVATION_FIXED,
      fixedYen: 3000,
      hourlyYen: null,
      roundingType: ROUNDING_TYPE_CEIL_HOUR,
      isActive: true,
    },
    create: {
      id: 'rifu-reservation-fixed-rule',
      placeId: place.id,
      pricingType: PRICING_TYPE_RESERVATION_FIXED,
      fixedYen: 3000,
      hourlyYen: null,
      roundingType: ROUNDING_TYPE_CEIL_HOUR,
      isActive: true,
    },
  })

  await prisma.pricingRule.upsert({
    where: { id: 'rifu-hourly-rule' },
    update: {
      placeId: place.id,
      pricingType: PRICING_TYPE_HOURLY,
      hourlyYen: 500,
      fixedYen: null,
      roundingType: ROUNDING_TYPE_CEIL_HOUR,
      isActive: true,
    },
    create: {
      id: 'rifu-hourly-rule',
      placeId: place.id,
      pricingType: PRICING_TYPE_HOURLY,
      hourlyYen: 500,
      fixedYen: null,
      roundingType: ROUNDING_TYPE_CEIL_HOUR,
      isActive: true,
    },
  })

  await prisma.eventDay.upsert({
    where: {
      placeId_date: {
        placeId: place.id,
        date: new Date('2026-03-20T00:00:00.000Z'),
      },
    },
    update: {
      label: 'EVENT',
      fixedYenOverride: 3000,
      hourlyYenOverride: 800,
      isActive: true,
    },
    create: {
      placeId: place.id,
      date: new Date('2026-03-20T00:00:00.000Z'),
      label: 'EVENT',
      fixedYenOverride: 3000,
      hourlyYenOverride: 800,
      isActive: true,
    },
  })

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@parktech.local'
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!'
  const passwordHash = await bcrypt.hash(adminPassword, 10)

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      name: 'ParkTech Admin',
      passwordHash,
    },
    create: {
      email: adminEmail,
      name: 'ParkTech Admin',
      passwordHash,
    },
  })

  const busPartners = [
    {
      name: 'ホテル利府',
      contact: '田中 太郎',
      phone: '022-345-6789',
      email: 'tanaka@hotel-rifu.example.com',
    },
    {
      name: '仙台観光バス',
      contact: '佐藤 花子',
      phone: '022-123-4567',
      email: 'sato@sendai-bus.example.com',
    },
    {
      name: 'みちのく旅行社',
      contact: '鈴木 一郎',
      phone: '022-987-6543',
      email: 'suzuki@michinoku-travel.example.com',
    },
  ]

  for (const partner of busPartners) {
    const existing = await prisma.busPartner.findFirst({
      where: { name: partner.name },
      select: { id: true },
    })

    if (existing) {
      await prisma.busPartner.update({
        where: { id: existing.id },
        data: {
          contact: partner.contact,
          phone: partner.phone,
          email: partner.email,
          isActive: true,
        },
      })
    } else {
      await prisma.busPartner.create({
        data: partner,
      })
    }
  }

  console.log('Seed completed')
  console.log(`Place ID: ${place.id}`)
  console.log(`Operation Mode: ${place.operationMode}`)
  console.log(`Admin Email: ${adminEmail}`)
  console.log(`Bus Partners: ${busPartners.length} entries`)
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })