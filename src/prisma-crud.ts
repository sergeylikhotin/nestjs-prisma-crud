import {
    getAllJoinSubsets,
    transformJoinsToInclude,
    transformForNestedCreate,
    validateNestedWhere,
} from './utils';

export type CrudObj = any; // TODO: strong type all any's
export type CrudWhere = any;

export class PrismaCrudService {
    private notFoundError: any;
    private forbiddenError: any;
    private defaultIncludes: any;
    private paginationDefaults = {
        pageSize: 25,
        orderBy: [{ id: 'asc' }],
    }; // TODO: make defaults configurable. Also Max/min for pageSize and orderBy validations/restrictions
    private allowedJoinsSet: Set<string>;
    private defaultJoins: string[];
    private repo: any;

    constructor(args: {
        repo: any;
        allowedJoins: string[];
        defaultJoins?: string[];
        notFoundError: any;
        forbiddenError: any;
    }) {
        // TODO: mechanism for checking prisma client version and ensuring it is tested/supported
        this.repo = args.repo;

        this.allowedJoinsSet = getAllJoinSubsets(args.allowedJoins);
        this.defaultJoins = this.getSanitizedDefaultJoins(args.defaultJoins, this.allowedJoinsSet);

        this.defaultIncludes = transformJoinsToInclude(this.defaultJoins);

        this.notFoundError = args.notFoundError;
        this.forbiddenError = args.forbiddenError;
    }

    private getSanitizedDefaultJoins(
        defaultJoins: string[] | undefined | null,
        allowedJoinsSet: Set<string>,
    ) {
        if (!(defaultJoins instanceof Array)) {
            return [...allowedJoinsSet]; // defaultJoins equals allowedJoins when not specified
        }

        for (let i = 0; i < defaultJoins.length; i++) {
            const join = defaultJoins[i];
            if (!allowedJoinsSet.has(join)) {
                throw new Error(
                    `defaultJoins contains strings that are not preset in allowedJoins`,
                );
            }
        }

        return [...new Set(defaultJoins)];
    }

    private getIncludes(requestSpecificIncludes: string[] | undefined | null) {
        if (!requestSpecificIncludes) {
            return this.defaultIncludes;
        }

        const allowedJoins = [];
        for (let i = 0; i < requestSpecificIncludes.length; i++) {
            const reqInclude = requestSpecificIncludes[i];
            if (this.allowedJoinsSet.has(reqInclude)) {
                allowedJoins.push(reqInclude);
            } else {
                this.forbiddenError.message = `Join relation not allowed: ${reqInclude}`;
                throw this.forbiddenError;
            }
        }

        return transformJoinsToInclude([...new Set(allowedJoins)]);
    }

    private parseCrudQ(crudQ: undefined | null | string): CrudObj {
        // TODO: Add return type and rough validation
        return crudQ ? JSON.parse(crudQ) : {};
    }

    private getAndValidateWhere(crudObj: CrudObj): CrudWhere {
        const where = crudObj.where || {};
        validateNestedWhere(where, this.allowedJoinsSet, this.forbiddenError);
        return where;
    }

    private getAndValidatePagination(
        crudObj: CrudObj,
    ): {
        skip: number;
        take: number;
        orderBy: any;
        page: number;
        pageSize: number;
    } {
        // TODO: Validate user inputs!!
        let { page, pageSize, orderBy } = crudObj;
        page = +page || 1;
        pageSize = +pageSize || this.paginationDefaults.pageSize;
        const paginationObj = {
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: orderBy instanceof Object || this.paginationDefaults.orderBy,
            page,
            pageSize,
        };

        return paginationObj;
    }

    public async create(createDto: any) {
        const entity = await this.repo.create({
            data: transformForNestedCreate(createDto),
        });
        return this.findOne(entity.id);
    }

    public async findAll(crudQ?: string) {
        const crudObj = this.parseCrudQ(crudQ);
        const where = this.getAndValidateWhere(crudObj);
        const { skip, take, orderBy, page, pageSize } = this.getAndValidatePagination(crudObj);

        const summary = await this.repo.aggregate({
            where,
            _count: { id: true },
        });
        const count = summary._count.id;
        const recordsPerPage = take;
        const pageCount = Math.ceil(count / recordsPerPage);

        const matches = await this.repo.findMany({
            where: { ...where },
            ...this.getIncludes(crudObj.joins),
            skip,
            take,
        });

        return {
            data: matches,
            totalRecords: count,
            pageCount,
            page,
            pageSize,
            orderBy,
        };
    }

    public async findOne(id: string, crudQ?: string) {
        const crudObj = this.parseCrudQ(crudQ);
        const where = this.getAndValidateWhere(crudObj);

        const match = await this.repo.findFirst({
            where: { ...where, id },
            ...this.getIncludes(crudObj.joins),
        });

        if (!match) {
            throw this.notFoundError;
        }
        return match;
    }

    public async update(id: string, updateDto: any, crudQ?: string) {
        // Check that entity is accessible when considering id and crudQ restrictions
        const entity = await this.findOne(id, crudQ);

        // update and return standard findOne
        await this.repo.update({
            where: { id: entity.id },
            data: transformForNestedCreate(updateDto, entity),
        });

        return this.findOne(id, crudQ);
    }

    public async remove(id: string, crudQ?: string) {
        // Check that entity is accessible when considering id and crudQ restrictions
        const entity = await this.findOne(id, crudQ);

        await this.repo.delete({ where: { id: entity.id } });

        return null;
    }
}
